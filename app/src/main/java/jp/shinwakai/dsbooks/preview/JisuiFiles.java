package jp.shinwakai.dsbooks.preview;

import android.content.Context;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** `.jisui` (jisui-1) = a ZIP of a FullOCR vault. A member is addressed as "<container localName>\n<entry path>".
 *  Members are read in place; only a PDF is copied out (to the cache) because PdfRenderer needs a file. Never writes the .jisui. */
final class JisuiFiles {
    private JisuiFiles() {}
    static boolean isMember(String name) { return name != null && name.indexOf('\n') > 0; }
    static String container(String name) { return name.substring(0, name.indexOf('\n')); }
    static String entry(String name) { return name.substring(name.indexOf('\n') + 1); }

    private static ZipEntry find(ZipFile zip, String entry) {
        if (entry.isEmpty() || entry.startsWith("/") || ("/" + entry + "/").contains("/../")) return null;
        ZipEntry e = zip.getEntry(entry);
        return e == null || e.isDirectory() ? null : e;
    }

    static boolean has(File container, String entry) {
        try (ZipFile zip = new ZipFile(container)) { return find(zip, entry) != null; } catch (Exception e) { return false; }
    }

    static byte[] read(File container, String entry, long max) throws IOException {
        try (ZipFile zip = new ZipFile(container)) {
            ZipEntry e = find(zip, entry);
            if (e == null) throw new IOException("not found");
            if (e.getSize() > max) throw new IOException("too large");
            try (InputStream in = zip.getInputStream(e)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) != -1) { out.write(b, 0, n); if (out.size() > max) throw new IOException("too large"); }
                return out.toByteArray();
            }
        }
    }

    static String readText(File container, String entry) {
        try { return new String(read(container, entry, 4L * 1024 * 1024), StandardCharsets.UTF_8); } catch (Exception e) { return null; }
    }

    static String dataUrl(File container, String entry) {
        try {
            String lower = entry.toLowerCase(Locale.ROOT);
            String mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".gif") ? "image/gif" : lower.endsWith(".webp") ? "image/webp" : lower.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
            return "data:" + mime + ";base64," + Base64.encodeToString(read(container, entry, 8L * 1024 * 1024), Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }

    static String entries(File container) {
        JSONArray out = new JSONArray();
        try (ZipFile zip = new ZipFile(container)) {
            Enumeration<? extends ZipEntry> all = zip.entries();
            while (all.hasMoreElements()) {
                ZipEntry e = all.nextElement();
                if (!e.isDirectory()) out.put(new JSONObject().put("name", e.getName()).put("size", e.getSize()));
            }
            return out.toString();
        } catch (Exception e) { return null; }
    }

    /** The member as a real file (for PdfRenderer). Cached by container identity and entry; streamed, never held in memory. */
    static File extract(Context c, File container, String entry) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update((container.getCanonicalPath() + "|" + container.length() + "|" + container.lastModified() + "|" + entry).getBytes(StandardCharsets.UTF_8));
        StringBuilder key = new StringBuilder();
        for (byte x : md.digest()) key.append(String.format(Locale.ROOT, "%02x", x & 255));
        File dir = new File(c.getCacheDir(), "jisui");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cache");
        String ext = entry.contains(".") ? entry.substring(entry.lastIndexOf('.')).toLowerCase(Locale.ROOT) : "";
        File target = new File(dir, key + ext);
        if (target.isFile()) return target;
        File[] old = dir.listFiles();
        if (old != null && old.length > 6) for (File f : old) f.delete(); // keep the cache small (a few open books)
        try (ZipFile zip = new ZipFile(container)) {
            ZipEntry e = find(zip, entry);
            if (e == null) throw new IOException("PDFが.jisuiの中に見つかりません");
            File tmp = new File(dir, key + ".part");
            try (InputStream in = zip.getInputStream(e); OutputStream out = new FileOutputStream(tmp)) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) != -1) out.write(b, 0, n);
            }
            if (!tmp.renameTo(target)) { tmp.delete(); throw new IOException("cache"); }
        }
        return target;
    }
}
