package jp.shinwakai.dsbooks.preview;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** Grants read-only access to a downloaded book for Android reader/player apps. */
public final class LocalBookProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) {
        String n = uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment().toLowerCase();
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".cbz")) return "application/vnd.comicbook+zip";
        if (n.endsWith(".cbr")) return "application/vnd.comicbook-rar";
        if (n.endsWith(".epub")) return "application/epub+zip";
        if (n.endsWith(".md")) return "text/markdown";
        if (n.endsWith(".m4a") || n.endsWith(".m4b")) return "audio/mp4";
        return "application/octet-stream";
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f = resolve(uri);
        String[] cols = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor c = new MatrixCursor(cols);
        Object[] row = new Object[cols.length];
        for (int i=0;i<cols.length;i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i]=uri.getQueryParameter("name")==null?f.getName():uri.getQueryParameter("name");
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i]=f.length();
        }
        c.addRow(row);
        return c;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only provider");
        File f=resolve(uri);
        if (!f.isFile()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }
    private File resolve(Uri uri) {
        try { return BookStorage.resolve(getContext(),uri.getLastPathSegment()); }
        catch(Exception e) { return new File(getContext().getFilesDir(),"invalid-book-reference"); }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
