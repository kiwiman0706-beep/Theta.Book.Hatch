package jp.shinwakai.dsbooks.preview;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Large page data that does not fit the WebView's localStorage quota (a few MB per origin): the library catalog of a
 *  big NAS (e.g. 15,000 books). Kept in files/store/<key>.json, read once into memory, written on a background thread
 *  (latest value wins, written to a temp file then renamed). Only keys "dsbooks.<name>" (see native-store.js). */
final class NativeStore {
    private static final Map<String, String> cache = new HashMap<>();
    private static final Map<String, String> pending = new HashMap<>();
    private static final ExecutorService writer = Executors.newSingleThreadExecutor();

    static boolean validKey(String key) { return key != null && key.matches("dsbooks\\.[A-Za-z0-9._-]{1,80}"); }

    private static File file(Context c, String key) { return new File(new File(c.getFilesDir(), "store"), key + ".json"); }

    static synchronized String get(Context c, String key) {
        if (!validKey(key)) return null;
        if (cache.containsKey(key)) return cache.get(key);
        String value = null;
        File f = file(c, key);
        try { if (f.isFile()) value = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8); } catch (Exception ignored) {}
        cache.put(key, value);
        return value;
    }

    static synchronized boolean set(Context c, String key, String value) {
        if (!validKey(key)) return false;
        cache.put(key, value);
        boolean queued = pending.containsKey(key);
        pending.put(key, value);
        if (!queued) { Context app = c.getApplicationContext(); writer.execute(() -> flush(app, key)); }
        return true;
    }

    private static void flush(Context c, String key) {
        String value;
        synchronized (NativeStore.class) { value = pending.remove(key); }
        File f = file(c, key);
        try {
            if (value == null) { f.delete(); return; }
            File dir = f.getParentFile(); if (dir != null) dir.mkdirs();
            File tmp = new File(dir, key + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(value.getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
            if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) throw new java.io.IOException("rename"); }
        } catch (Exception ignored) {}
    }

    static String keys(Context c) {
        org.json.JSONArray out = new org.json.JSONArray();
        java.util.Set<String> names = new java.util.TreeSet<>();
        synchronized (NativeStore.class) { for (Map.Entry<String, String> e : cache.entrySet()) if (e.getValue() != null) names.add(e.getKey()); }
        File[] files = new File(c.getFilesDir(), "store").listFiles();
        if (files != null) for (File f : files) { String n = f.getName(); if (n.endsWith(".json")) { String k = n.substring(0, n.length() - 5); if (validKey(k) && get(c, k) != null) names.add(k); } }
        for (String n : names) out.put(n);
        return out.toString();
    }
}
