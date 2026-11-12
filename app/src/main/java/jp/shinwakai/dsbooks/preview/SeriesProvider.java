package jp.shinwakai.dsbooks.preview;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileNotFoundException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Theta Hatch series provider (Theta.Hatch.Series spec/THETA_SHARED_SETTINGS.md §4.2), authority <applicationId>.theta,
 *  readable only by apps signed with the series key (permission app.thetahatch.permission.SHARE, protectionLevel signature).
 *  /shelf: the books Home shows in its "本" area — reading, favourites, recent (at most 30), from the snapshot the page
 *  publishes (MainActivity.updateShelf). /cover/<file>: the cover image of a shelf row. Nothing secret is served. */
public class SeriesProvider extends ContentProvider {
    static final String PREFS = "series_shelf";
    private static final String[] COLUMNS = {"section", "sectionTitle", "id", "title", "subtitle", "text", "image", "action", "color"};

    static Uri shelfUri(Context c) { return Uri.parse("content://" + c.getPackageName() + ".theta/shelf"); }

    /** Saves the page's snapshot and tells Home to read it again. */
    static void publish(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("rows", json == null ? "[]" : json).apply();
        c.getContentResolver().notifyChange(shelfUri(c), null);
    }

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        if (!"shelf".equals(first(uri))) return null;
        Context c = getContext();
        MatrixCursor out = new MatrixCursor(COLUMNS);
        try {
            JSONArray rows = new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("rows", "[]"));
            for (int i = 0; i < Math.min(rows.length(), 30); i++) {
                JSONObject r = rows.getJSONObject(i);
                String id = r.optString("id");
                Intent open = new Intent(Intent.ACTION_MAIN).setClassName(c.getPackageName(), MainActivity.class.getName())
                    .putExtra("dsbooks.widget.book_id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                File cover = cover(c, r);
                String image = cover == null ? "" : "content://" + c.getPackageName() + ".theta/cover/" + cover.getName();
                out.addRow(new Object[]{r.optString("section"), r.optString("sectionTitle"), id, r.optString("title"), r.optString("subtitle"), "", image, open.toUri(Intent.URI_INTENT_SCHEME), ""});
            }
        } catch (Exception ignored) {}
        out.setNotificationUri(c.getContentResolver(), shelfUri(c));
        return out;
    }

    /** The cached cover: a saved book's own (thumbnails/<digest(localName)>.jpg), else the NAS one (remote-<digest(key)>.jpg). */
    private static File cover(Context c, JSONObject r) {
        File dir = new File(c.getFilesDir(), "thumbnails");
        String local = r.optString("coverLocal"), remote = r.optString("coverRemote");
        if (!local.isEmpty()) { File f = new File(dir, digest(local) + ".jpg"); if (f.isFile() && f.length() > 0) return f; }
        if (!remote.isEmpty()) { File f = new File(dir, "remote-" + digest(remote) + ".jpg"); if (f.isFile() && f.length() > 0) return f; }
        return null;
    }

    /** Same digest as MainActivity.digest (first 16 bytes of SHA-256, hex). */
    static String digest(String value) {
        try {
            byte[] b = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder s = new StringBuilder();
            for (int i = 0; i < 16; i++) s.append(String.format(Locale.ROOT, "%02x", b[i] & 0xff));
            return s.toString();
        } catch (Exception e) { return ""; }
    }

    private static String first(Uri uri) { return uri.getPathSegments().isEmpty() ? "" : uri.getPathSegments().get(0); }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode) || uri.getPathSegments().size() != 2 || !"cover".equals(first(uri))) throw new FileNotFoundException(uri.toString());
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("(remote-)?[0-9a-f]{32}\\.jpg")) throw new FileNotFoundException(uri.toString());
        File f = new File(new File(getContext().getFilesDir(), "thumbnails"), name);
        if (!f.isFile()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) { return "cover".equals(first(uri)) ? "image/jpeg" : "vnd.android.cursor.dir/vnd.thetahatch.shelf"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
