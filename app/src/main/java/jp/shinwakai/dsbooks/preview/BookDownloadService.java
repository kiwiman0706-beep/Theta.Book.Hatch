package jp.shinwakai.dsbooks.preview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Keeps one DSM book download alive while the Activity is backgrounded. */
public final class BookDownloadService extends Service {
    public static final String ACTION_EVENT = "jp.shinwakai.dsbooks.preview.DOWNLOAD_EVENT";
    public static final String ACTION_PAUSE = "jp.shinwakai.dsbooks.preview.DOWNLOAD_PAUSE";
    public static final String ACTION_RESUME = "jp.shinwakai.dsbooks.preview.DOWNLOAD_RESUME";
    public static final String ACTION_CANCEL = "jp.shinwakai.dsbooks.preview.DOWNLOAD_CANCEL";
    private static final String CHANNEL = "dsbooks_downloads";
    private static final int NOTIFICATION_ID = 7406;

    private volatile boolean paused;
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;
    private volatile Thread worker;
    private final Object pauseLock = new Object();
    private String bookId = "";
    private String title = "本";
    private volatile int currentPercent = 0;
    private volatile long currentDone = 0;
    private volatile long currentTotal = 0;
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "DSBooksのダウンロード", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("NASから端末への書籍保存状況");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        PowerManager pm = (PowerManager)getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DSBooks:download");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            if (worker != null && worker.isAlive()) { paused = true; publishState("paused", currentPercent, currentDone, currentTotal, null); updateNotification("一時停止中 · " + title, currentPercent, true); }
            else stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            if (worker != null && worker.isAlive()) { synchronized (pauseLock) { paused = false; pauseLock.notifyAll(); }
                publishState("running", currentPercent, currentDone, currentTotal, null); updateNotification("ダウンロードを再開 · " + title, currentPercent, false); }
            else stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (ACTION_CANCEL.equals(action)) {
            cancelled = true; paused = false; synchronized (pauseLock) { pauseLock.notifyAll(); }
            HttpURLConnection c = connection; if (c != null) c.disconnect();
            Thread t = worker; if (t != null) t.interrupt();
            if (t == null || !t.isAlive()) { publishResult(false, "ダウンロードをキャンセルしました", null, 0); stopForeground(true); stopSelf(); }
            else updateNotification("キャンセル中 · " + title, -1, true);
            return START_NOT_STICKY;
        }
        if (intent == null) return START_NOT_STICKY;

        if (worker != null && worker.isAlive()) {
            if (bookId.equals(intent.getStringExtra("bookId"))) return START_REDELIVER_INTENT;
            publishResultFor(intent.getStringExtra("bookId"), false, "別の本をダウンロード中です。完了後にもう一度お試しください。", null, 0);
            return START_REDELIVER_INTENT;
        }
        bookId = intent.getStringExtra("bookId");
        title = intent.getStringExtra("title");
        if (bookId == null) bookId = "";
        if (title == null || title.isEmpty()) title = "本";
        startForeground(NOTIFICATION_ID, notification("ダウンロードを準備中", 0, false));
        if (!wakeLock.isHeld()) wakeLock.acquire(6L * 60 * 60 * 1000);
        final Intent job = intent;
        paused = false; cancelled = false;
        currentPercent=0; currentDone=0; currentTotal=job.getLongExtra("expectedSize", 0);
        publishState("running", 0, 0, currentTotal, null);
        worker = new Thread(() -> runDownload(job), "dsbooks-download");
        worker.start();
        return START_REDELIVER_INTENT;
    }

    private void runDownload(Intent job) {
        File partial = null;
        try {
            String storageId=job.getStringExtra("storageId");if(storageId==null)storageId=BookStorage.selected(this);
            File dir=BookStorage.directory(this,storageId,true);
            String base = job.getStringExtra("base");
            String apiPath = job.getStringExtra("apiPath");
            String version = job.getStringExtra("version");
            String sid = job.getStringExtra("sid");
            String remotePath = job.getStringExtra("remotePath");
            long expected = job.getLongExtra("expectedSize", 0);
            if (expected > 0) {
                long free = dir.getUsableSpace(), reserve = Math.max(8L * 1024 * 1024, expected / 50);
                if (free < expected + reserve) throw new Exception("選択した保存先の空き容量が不足しています。ファイルは " + human(expected) + "、空き容量は " + human(free) + " です。");
            }
            String ext = ""; int dot = remotePath == null ? -1 : remotePath.lastIndexOf('.');
            if (dot >= 0 && dot > remotePath.lastIndexOf('/')) ext = remotePath.substring(dot).replaceAll("[^A-Za-z0-9.]", "").toLowerCase(Locale.ROOT);
            String filename = digest(remotePath == null ? title : remotePath) + ext;
            String localName=BookLocation.encode(storageId,filename);
            File target = BookLocation.child(dir,filename); partial = BookLocation.child(dir,filename + ".part");
            String endpoint = base.replaceAll("/$", "") + "/webapi/" + (apiPath == null || apiPath.isEmpty() ? "entry.cgi" : apiPath.replaceAll("^/", ""));
            String query = "api=" + enc("SYNO.FileStation.Download") + "&version=" + enc(version == null || version.isEmpty() ? "2" : version)
                    + "&method=download&path=" + enc(new JSONArray().put(remotePath).toString()) + "&mode=download&_sid=" + enc(sid);
            HttpURLConnection c = (HttpURLConnection) new URL(endpoint + "?" + query).openConnection(); connection = c;
            c.setRequestMethod("GET"); c.setConnectTimeout(20000); c.setReadTimeout(120000); c.setInstanceFollowRedirects(false);
            int status = c.getResponseCode(); String contentType = c.getContentType();
            if (contentType != null && (contentType.contains("text/html") || contentType.contains("application/json"))) {
                String body = readErrorBody(status >= 400 ? c.getErrorStream() : c.getInputStream());
                try {
                    JSONObject json = new JSONObject(body); JSONObject error = json.optJSONObject("error"); int code = error == null ? -1 : error.optInt("code", -1);
                    if (code == 119 || code == 106 || code == 107) throw new Exception("DSM_SESSION_EXPIRED");
                    if (code > 0) throw new Exception("DSM APIエラー " + code + "。接続し直してから再試行してください。");
                } catch (org.json.JSONException ignored) { }
                throw new Exception("NASがファイルではなくログイン/API応答を返しました。NASへ再接続してください。");
            }
            if (status < 200 || status >= 300) throw new Exception("NASからダウンロードできません（HTTP " + status + "）。再接続してお試しください。");
            long contentLength = c.getContentLengthLong();
            long total = contentLength; if (total <= 0) total = expected;
            try (InputStream in = new BufferedInputStream(c.getInputStream()); FileOutputStream out = new FileOutputStream(partial)) {
                byte[] buffer = new byte[128 * 1024]; long done = 0; int read, last = -1;
                while (true) {
                    awaitResume(); if (cancelled) throw new InterruptedException("キャンセル");
                    read = in.read(buffer); if (read == -1) break;
                    out.write(buffer, 0, read); done += read;
                    int pct = total > 0 ? (int)Math.min(99, done * 100 / total) : -1;
                    currentPercent=pct; currentDone=done; currentTotal=total;
                    if (pct != last) { last = pct; publishState("running", pct, done, total, null); updateNotification("保存中 · " + title, pct, false); }
                }
                out.getFD().sync();
                if (contentLength > 0 && done != contentLength) throw new Exception("保存サイズが通信応答と一致しません。再試行してください。");
                if (expected > 0 && done != expected) throw new Exception("保存サイズがNASの表示と一致しません（" + done + " / " + expected + " bytes）。通信状態を確認して再試行してください。");
                if (cancelled) throw new InterruptedException("キャンセル");
                if (target.exists() && !target.delete()) throw new Exception("以前の保存ファイルを置き換えられませんでした");
                if (!partial.renameTo(target)) throw new Exception("ダウンロードしたファイルを確定できませんでした");
                partial = null; publishResult(true, null, localName, target.length());
                updateNotification("保存完了 · " + title, 100, false);
            }
        } catch (InterruptedException e) {
            if (partial != null) partial.delete();
            publishResult(false, cancelled ? "ダウンロードをキャンセルしました" : "ダウンロードを中断しました。再試行してください。", null, 0);
        } catch (Exception e) {
            if (partial != null) partial.delete();
            String message = cancelled ? "ダウンロードをキャンセルしました" : (e.getMessage() == null ? "ダウンロードに失敗しました" : e.getMessage());
            publishResult(false, message, null, 0);
            if (!cancelled) updateNotification("保存に失敗 · " + title, -1, true);
        } finally {
            HttpURLConnection c = connection; connection = null; if (c != null) c.disconnect();
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            worker = null;
            stopSelf();
        }
    }

    private void awaitResume() throws InterruptedException {
        synchronized (pauseLock) { while (paused && !cancelled) pauseLock.wait(); }
    }

    private void publishState(String state, int pct, long done, long total, String error) {
        JSONObject data = new JSONObject();
        try { data.put("id", bookId); data.put("state", state); data.put("percent", pct); data.put("done", done); data.put("total", total); if (error != null) data.put("error", error); } catch (Exception ignored) { }
        getSharedPreferences("download", MODE_PRIVATE).edit().putString("state", data.toString()).apply();
        Intent event = new Intent(ACTION_EVENT).setPackage(getPackageName()).putExtras(dataToBundle(data)); sendBroadcast(event);
    }

    private android.os.Bundle dataToBundle(JSONObject data) {
        android.os.Bundle b = new android.os.Bundle(); b.putString("id", data.optString("id")); b.putString("state", data.optString("state"));
        b.putInt("percent", data.optInt("percent", -1)); b.putLong("done", data.optLong("done")); b.putLong("total", data.optLong("total"));
        if (data.has("error")) b.putString("error", data.optString("error")); return b;
    }

    private void publishResult(boolean ok, String error, String localName, long size) {
        publishResultFor(bookId, ok, error, localName, size);
    }

    private void publishResultFor(String id, boolean ok, String error, String localName, long size) {
        JSONObject result = new JSONObject();
        try { result.put("id", id); result.put("ok", ok); if (error != null) result.put("error", error); if (localName != null) result.put("localName", localName); result.put("size", size); } catch (Exception ignored) { }
        getSharedPreferences("download", MODE_PRIVATE).edit().putString("result", result.toString()).apply();
        Intent event = new Intent(ACTION_EVENT).setPackage(getPackageName()).putExtra("result", result.toString()); sendBroadcast(event);
        publishState(ok ? "complete" : cancelled ? "cancelled" : "error", ok ? 100 : -1, size, size, error);
    }

    private void updateNotification(String text, int percent, boolean pausedOrError) {
        NotificationManager manager = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, notification(text, percent, pausedOrError));
    }

    private Notification notification(String text, int percent, boolean pausedNow) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 7406, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("DSBooks").setContentText(text).setContentIntent(openPi).setOnlyAlertOnce(true).setOngoing(percent >= 0 && percent < 100).setAutoCancel(percent == 100);
        if (percent >= 0 && percent < 100) b.setProgress(100, percent, false);
        if (percent >= 0 && percent < 100) {
            String action = pausedNow ? ACTION_RESUME : ACTION_PAUSE, label = pausedNow ? "再開" : "一時停止";
            b.addAction(0, label, controlPending(action, 1));
            b.addAction(0, "キャンセル", controlPending(ACTION_CANCEL, 2));
        }
        return b.build();
    }

    private PendingIntent controlPending(String action, int code) {
        Intent intent = new Intent(this, BookDownloadService.class).setAction(action);
        return PendingIntent.getService(this, 7406 + code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public void onDestroy() {
        HttpURLConnection c = connection; if (c != null) c.disconnect();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private String enc(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }
    private String digest(String value) {
        try { byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));StringBuilder out=new StringBuilder();for(int i=0;i<16;i++)out.append(String.format(Locale.ROOT,"%02x",bytes[i]&255));return out.toString(); }
        catch(Exception e){return Integer.toHexString(value.hashCode());}
    }
    private String human(long bytes) { if(bytes<1024)return bytes+" B";if(bytes<1024L*1024)return String.format(Locale.ROOT,"%.0f KB",bytes/1024.0);if(bytes<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",bytes/(1024.0*1024));return String.format(Locale.ROOT,"%.1f GB",bytes/(1024.0*1024*1024)); }
    private String readErrorBody(InputStream in) throws Exception {
        if(in==null)return "";try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n,remaining=64*1024;while(remaining>0&&(n=source.read(buffer,0,Math.min(buffer.length,remaining)))!=-1){out.write(buffer,0,n);remaining-=n;}return new String(out.toByteArray(),StandardCharsets.UTF_8);}
    }
}
