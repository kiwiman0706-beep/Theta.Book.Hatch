package jp.shinwakai.dsbooks.preview;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Theta Hatch migration (Theta.Hatch.Series docs/MIGRATION.md §3): one zip "theta-export-1" written by the bridge
 *  version (app.thetahatch.action.EXPORT) and read by the new app (app.thetahatch.action.IMPORT).
 *  Contents: manifest.json (format, app, from, files with SHA-256), storage.json (the page's dsbooks.* items) and
 *  nas.json (NAS address and account only). Never passwords, SIDs, API keys or book files. */
final class Migration {
    private Migration() {}
    static final String FORMAT = "theta-export-1";
    static final String[] HUBS = {"app.thetahatch.home", "app.thetahatch.kidshome", "jp.yaegaki.theta.home", "com.theta.kidshome"};
    private static final long MAX_ENTRY = 32L * 1024 * 1024, MAX_TOTAL = 64L * 1024 * 1024;

    static boolean isHub(String pkg) { if (pkg == null) return false; for (String h : HUBS) if (h.equals(pkg)) return true; return false; }
    static boolean isExportName(String name) { return name != null && name.matches("migration-[0-9a-z-]{1,64}\\.zip"); }
    static File dir(Context c) { File d = new File(c.getCacheDir(), "migration"); d.mkdirs(); return d; }

    static String sha256(byte[] data) throws Exception {
        StringBuilder s = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) s.append(String.format(Locale.ROOT, "%02x", b & 255));
        return s.toString();
    }

    /** Writes the export zip and returns it. Old exports are removed first (one at a time). */
    static File write(Context c, String packageName, String versionName, String storageJson, String nasJson) throws Exception {
        if (storageJson == null || storageJson.length() > MAX_ENTRY) throw new IOException("書き出すデータが大きすぎます");
        new JSONObject(storageJson); // must be an object
        File d = dir(c);
        File[] old = d.listFiles();
        if (old != null) for (File f : old) f.delete();
        byte[] storage = storageJson.getBytes(StandardCharsets.UTF_8), nas = (nasJson == null ? "{}" : nasJson).getBytes(StandardCharsets.UTF_8);
        JSONObject manifest = new JSONObject().put("format", FORMAT).put("app", "book")
            .put("from", new JSONObject().put("packageName", packageName).put("versionName", versionName))
            .put("created", System.currentTimeMillis())
            .put("files", new JSONArray()
                .put(new JSONObject().put("name", "storage.json").put("size", storage.length).put("sha256", sha256(storage)))
                .put(new JSONObject().put("name", "nas.json").put("size", nas.length).put("sha256", sha256(nas))));
        File out = new File(d, "migration-book-" + System.currentTimeMillis() + ".zip");
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(out))) {
            put(z, "manifest.json", manifest.toString(2).getBytes(StandardCharsets.UTF_8));
            put(z, "storage.json", storage);
            put(z, "nas.json", nas);
        }
        return out;
    }

    private static void put(ZipOutputStream z, String name, byte[] data) throws IOException { z.putNextEntry(new ZipEntry(name)); z.write(data); z.closeEntry(); }

    /** Reads and checks an export zip: {manifest, storage, nas}. Throws with a message the page can show. */
    static JSONObject read(Context c, Uri uri) throws Exception {
        JSONObject manifest = null; String storage = null, nas = null; long total = 0;
        try (InputStream in = c.getContentResolver().openInputStream(uri); ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
                while ((n = z.read(buf)) > 0) { b.write(buf, 0, n); total += n; if (b.size() > MAX_ENTRY || total > MAX_TOTAL) throw new IOException("ファイルが大きすぎます"); }
                String text = new String(b.toByteArray(), StandardCharsets.UTF_8);
                if ("manifest.json".equals(e.getName())) manifest = new JSONObject(text);
                else if ("storage.json".equals(e.getName())) storage = text;
                else if ("nas.json".equals(e.getName())) nas = text;
            }
        }
        if (manifest == null || !FORMAT.equals(manifest.optString("format")) || !"book".equals(manifest.optString("app")))
            throw new IOException("Theta Book Hatch（DSBooks）の書き出しファイルではありません");
        if (storage == null) throw new IOException("書き出しファイルが壊れています（storage.json がありません）");
        JSONArray files = manifest.optJSONArray("files");
        for (int i = 0; files != null && i < files.length(); i++) {
            JSONObject f = files.getJSONObject(i); String name = f.optString("name");
            String body = "storage.json".equals(name) ? storage : "nas.json".equals(name) ? nas : null;
            if (body != null && !sha256(body.getBytes(StandardCharsets.UTF_8)).equals(f.optString("sha256")))
                throw new IOException("書き出しファイルが壊れています（" + name + " が一致しません）");
        }
        return new JSONObject().put("manifest", manifest).put("storage", new JSONObject(storage)).put("nas", nas == null ? new JSONObject() : new JSONObject(nas));
    }
}
