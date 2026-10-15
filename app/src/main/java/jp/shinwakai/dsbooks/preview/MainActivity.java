package jp.shinwakai.dsbooks.preview;

import android.app.Activity;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.media.MediaPlayer;
import android.speech.tts.TextToSpeech;
import android.media.AudioAttributes;
import android.media.PlaybackParams;
import android.media.MediaMetadataRetriever;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.content.SharedPreferences;
import android.util.Base64;
import android.view.WindowManager;
import android.os.Build;
import android.content.ClipData;
import android.content.ActivityNotFoundException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.HashMap;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;
import java.util.Enumeration;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.DocumentBuilder;
import org.xml.sax.InputSource;
import javax.xml.XMLConstants;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.w3c.dom.Element;

/** WebView shell plus native, streaming NAS downloads and document handoff. */
public final class MainActivity extends Activity {
    private WebView webView;
    private android.widget.FrameLayout shell;
    private android.widget.LinearLayout startup;
    private android.widget.Button retryStartup;
    private final java.util.concurrent.ExecutorService storageChecks = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.ExecutorService thumbnailWorkers = java.util.concurrent.Executors.newFixedThreadPool(2);
    private final Runnable startupTimeout = () -> { if (retryStartup != null) retryStartup.setVisibility(android.view.View.VISIBLE); };
    private void showStartup() {
        startup.setVisibility(android.view.View.VISIBLE);
        retryStartup.setVisibility(android.view.View.GONE);
        mainHandler.removeCallbacks(startupTimeout);
        mainHandler.postDelayed(startupTimeout, 10000);
    }
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean webModalOpen = false;
    private static final int CREATE_DOCUMENT_REQUEST = 8124;
    private String pendingExportName;
    private String pendingWidgetBookId;
    private boolean pageReady;
    private DocumentExchange exchange;
    private final java.util.concurrent.ExecutorService comicWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicInteger comicRequest=new java.util.concurrent.atomic.AtomicInteger();
    private ComicArchive comicArchive; private String comicKey="";
    private final Map<String, JSONArray> epubProgressWeightCache = new HashMap<>();
    private boolean downloadReceiverRegistered;
    private boolean playbackReceiverRegistered;
    private final BroadcastReceiver playbackReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            if(CastAudio.isActive()&&!intent.getBooleanExtra("cast",false))return;
            String state = intent.getStringExtra("state");
            if (state != null) evaluate("window.onPlaybackState&&window.onPlaybackState(" + state + ")");
        }
    };
    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String result = intent.getStringExtra("result");
            if (result != null) { evaluate("window.onNativeDownload&&window.onNativeDownload(" + result + ")"); return; }
            String queue = intent.getStringExtra("queue");
            if (queue != null) { evaluate("window.onNativeDownloadQueue&&window.onNativeDownloadQueue(" + queue + ")"); return; }
            String id = intent.getStringExtra("id"), state = intent.getStringExtra("state");
            int pct = intent.getIntExtra("percent", -1); long done = intent.getLongExtra("done", 0), total = intent.getLongExtra("total", 0);
            evaluate("window.onNativeDownloadProgress&&window.onNativeDownloadProgress(" + JSONObject.quote(id) + "," + pct + "," + done + "," + total + ");window.onNativeDownloadState&&window.onNativeDownloadState(" + JSONObject.quote(id) + "," + JSONObject.quote(state) + ")");
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7410);
        exchange = new DocumentExchange(this, json -> evaluate("window.onDataExchange&&window.onDataExchange(" + json + ")"));
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        webView.addJavascriptInterface(new NativeBridge(), "DSBooksNative");
        pendingWidgetBookId = getIntent().getStringExtra("dsbooks.widget.book_id");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                pageReady=false;webView=null;shell.removeView(view);view.destroy();
                showStartup();retryStartup.setVisibility(android.view.View.VISIBLE);return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                dispatchWidgetBook();
                deliverDownloadState();
                deliverPlaybackState();
            }
        });
        shell = new android.widget.FrameLayout(this);
        shell.setBackgroundColor(android.graphics.Color.rgb(16,34,25));
        shell.addView(webView, new android.widget.FrameLayout.LayoutParams(-1,-1));
        startup = new android.widget.LinearLayout(this);
        startup.setOrientation(android.widget.LinearLayout.VERTICAL);
        startup.setGravity(android.view.Gravity.CENTER);
        startup.setBackgroundColor(android.graphics.Color.rgb(16,34,25));
        android.widget.TextView title = new android.widget.TextView(this);
        title.setText("DSBooks\n本棚を準備しています…");title.setTextSize(22);title.setTextColor(android.graphics.Color.WHITE);title.setGravity(android.view.Gravity.CENTER);
        startup.addView(title);
        retryStartup = new android.widget.Button(this);retryStartup.setText("再読み込み（保存データは保持）");
        retryStartup.setOnClickListener(v -> { if(webView==null){recreate();}else{pageReady=false;showStartup();webView.reload();} });
        startup.addView(retryStartup);shell.addView(startup,new android.widget.FrameLayout.LayoutParams(-1,-1));
        setContentView(shell);showStartup();
        webView.loadUrl("file:///android_asset/dsbooks-prototype.html");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override public void onBackPressed() { handleBack(); }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(BookDownloadService.ACTION_EVENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(downloadReceiver, filter);
        downloadReceiverRegistered = true;
        IntentFilter mediaFilter = new IntentFilter(MediaPlaybackService.ACTION_EVENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(playbackReceiver, mediaFilter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(playbackReceiver, mediaFilter);
        playbackReceiverRegistered = true;
        deliverDownloadState();
        deliverPlaybackState();
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) evaluate("window.dsbooksResumed&&window.dsbooksResumed()");
    }
    @Override protected void onPause() {
        if (webView != null) evaluate("window.dsbooksPaused&&window.dsbooksPaused()");
        super.onPause();
    }
    @Override protected void onStop() {
        if (downloadReceiverRegistered) { unregisterReceiver(downloadReceiver); downloadReceiverRegistered = false; }
        if (playbackReceiverRegistered) { unregisterReceiver(playbackReceiver); playbackReceiverRegistered = false; }
        super.onStop();
    }

    @Override protected void onDestroy() {
        diagnosticCancelled.set(true);comicRequest.incrementAndGet();comicWorker.execute(()->{if(comicArchive!=null)comicArchive.close();comicArchive=null;});comicWorker.shutdown();
        mainHandler.removeCallbacks(startupTimeout);storageChecks.shutdownNow();thumbnailWorkers.shutdownNow();
        if(webView!=null){shell.removeView(webView);webView.destroy();webView=null;}
        super.onDestroy();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingWidgetBookId = intent.getStringExtra("dsbooks.widget.book_id");
        dispatchWidgetBook();
    }

    private void dispatchWidgetBook() {
        if (!pageReady || webView == null || pendingWidgetBookId == null) return;
        String id = pendingWidgetBookId;
        pendingWidgetBookId = null;
        webView.evaluateJavascript("window.dsbooksOpenBookId&&window.dsbooksOpenBookId(" + JSONObject.quote(id) + ")", null);
    }

    private boolean backPending = false;

    private void handleBack() {
        if (backPending) return;
        if (pageReady && webView != null) {
            backPending = true;
            // Ask the entire app, not only an open reader, before leaving the activity.
            webView.evaluateJavascript("(function(){try{return !!(window.dsbooksHandleBack&&window.dsbooksHandleBack());}catch(e){console.error(e);return true;}})()", result -> {
                backPending = false;
                if (isFinishing() || isDestroyed()) return;
                if ("false".equals(result)) leaveRootScreen();
            });
            return;
        }
        leaveRootScreen();
    }

    private void leaveRootScreen() {
        if (webView != null && webView.canGoBack()) { webView.goBack(); return; }
        super.onBackPressed();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if(exchange != null && exchange.result(requestCode, resultCode, data)) return;
        if (requestCode != CREATE_DOCUMENT_REQUEST) return;
        final String localName = pendingExportName;
        pendingExportName = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || localName == null) return;
        final Uri destination = data.getData();
        new Thread(() -> {
            boolean ok = false;
            try (InputStream in = new FileInputStream(localFile(localName));
                 java.io.OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                if (out == null) throw new java.io.IOException("保存先を開けません");
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) >= 0) if (n > 0) out.write(buf, 0, n);
                out.flush(); ok = true;
            } catch (Exception ignored) { }
            final boolean result = ok;
            mainHandler.post(() -> evaluate("window.onBookExported&&window.onBookExported(" + result + ")"));
        }).start();
    }

    private final java.util.concurrent.atomic.AtomicBoolean diagnosticRunning = new java.util.concurrent.atomic.AtomicBoolean(false);
    private final java.util.concurrent.atomic.AtomicBoolean diagnosticCancelled = new java.util.concurrent.atomic.AtomicBoolean(false);
    private final class NativeBridge {
        @JavascriptInterface public void castAudio(String spec){mainHandler.post(()->CastAudio.choose(MainActivity.this,spec));}
        @JavascriptInterface public void stopCast(){mainHandler.post(CastAudio::stopIfActive);}
        @JavascriptInterface public void libraryReady() { mainHandler.post(() -> {mainHandler.removeCallbacks(startupTimeout);if(startup!=null)startup.setVisibility(android.view.View.GONE);}); }
        @JavascriptInterface public void checkSavedBooks(String json) {
            storageChecks.execute(() -> {
                JSONObject result=new JSONObject();
                try {JSONArray names=new JSONArray(json);for(int i=0;i<Math.min(50000,names.length())&&!Thread.currentThread().isInterrupted();i++){String name=names.optString(i);result.put(name,BookStorage.exists(MainActivity.this,name));}
                    evaluate("window.onSavedBooksChecked&&window.onSavedBooksChecked("+result+")");
                }catch(Exception ignored){}
            });
        }
        @JavascriptInterface public void runSelfTest(String files, String token) {
            if(!diagnosticRunning.compareAndSet(false,true)) { evaluate("window.onNativeSelfTest&&window.onNativeSelfTest("+JSONObject.quote(token)+",{\"busy\":true})");return; }
            diagnosticCancelled.set(false);
            new Thread(() -> { try { JSONObject result=DeviceDiagnostics.run(MainActivity.this,files,diagnosticCancelled::get, p -> evaluate("window.onNativeSelfTestProgress&&window.onNativeSelfTestProgress("+JSONObject.quote(token)+","+p+")"), MainActivity.this::extractEpubChapter);evaluate("window.onNativeSelfTest&&window.onNativeSelfTest("+JSONObject.quote(token)+","+result+")"); } finally { diagnosticRunning.set(false); } },"DSBooks-selftest").start();
        }
        @JavascriptInterface public void cancelSelfTest() { diagnosticCancelled.set(true); }
        @JavascriptInterface public void copyText(String text) { mainHandler.post(() -> { ((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("DSBooks",text)); }); }
        @JavascriptInterface public void shareText(String text) { mainHandler.post(() -> { try {startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text),"テキストを共有"));}catch(Exception e){evaluate("toast('共有先を開けませんでした')");} }); }
        @JavascriptInterface public void exportText(String text,String name) { mainHandler.post(() -> exchange.exportText(text,name)); }
        @JavascriptInterface public void openAudioInVlc(String localName, String displayName) { mainHandler.post(() -> {
            try {
                File file = localFile(localName);
                if (!file.isFile()) { evaluate("toast('保存した音声が見つかりません')"); return; }
                Uri uri = bookUri(localName).buildUpon().appendQueryParameter("name", displayName.replace('/', '_').replace('\\', '_')).build();
                Intent view = new Intent(Intent.ACTION_VIEW).setPackage("org.videolan.vlc").setDataAndType(uri, "audio/mp4")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                view.setClipData(ClipData.newUri(getContentResolver(), "DSBooks", uri));
                if (view.resolveActivity(getPackageManager()) == null) { evaluate("toast('VLCが見つかりません。VLCをインストールしてからお試しください')"); return; }
                playbackControl("stop", 0, 1f);
                startActivity(view);
            } catch (Exception e) { evaluate("toast('VLCを開けませんでした。ファイルを共有からもお試しください')"); }
        }); }

        @JavascriptInterface public void shareNamedBook(String localName,String displayName,String mime) { mainHandler.post(() -> {
            try { Uri uri=bookUri(localName).buildUpon().appendQueryParameter("name",displayName.replaceAll("[\\\\/:*?\"<>|]","_")).build();
                Intent send=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.setClipData(ClipData.newUri(getContentResolver(),"DSBooks",uri));
                startActivity(Intent.createChooser(send,"ファイルを共有"));
            }catch(Exception e){evaluate("window.onBookShareFailed&&window.onBookShareFailed()");}
        }); }

        @JavascriptInterface public void chooseBooks() { mainHandler.post(() -> exchange.choose(false)); }
        @JavascriptInterface public void chooseReadingData() { mainHandler.post(() -> exchange.choose(true)); }
        @JavascriptInterface public void exportReadingData(String json) { mainHandler.post(() -> exchange.export(json)); }
        @JavascriptInterface public void keepAwake(boolean keep) { mainHandler.post(() -> { if(keep)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }); }
        @JavascriptInterface public String getNetworkStatus() {
            JSONObject result = new JSONObject();
            try {
                android.net.ConnectivityManager cm = (android.net.ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
                android.net.NetworkCapabilities active = cm.getNetworkCapabilities(cm.getActiveNetwork());
                result.put("connected", active != null);
                boolean vpn = false;
                for (android.net.Network n : cm.getAllNetworks()) {
                    android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                    if (caps != null && caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)) vpn = true;
                }
                result.put("vpn", vpn);
            } catch (Exception ignored) { }
            return result.toString();
        }
        /** Synology Secure SignIn (sign-in approval / OTP). Found by its launcher label, so no package id is assumed. */
        @JavascriptInterface public void openSecureSignIn() { mainHandler.post(() -> {
            try {
                Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                for (android.content.pm.ResolveInfo r : getPackageManager().queryIntentActivities(launcher, 0)) {
                    String label = String.valueOf(r.loadLabel(getPackageManager())).toLowerCase(Locale.ROOT).replace(" ", "");
                    String pkg = r.activityInfo.packageName.toLowerCase(Locale.ROOT);
                    if (label.contains("securesignin") || (pkg.contains("synology") && pkg.contains("signin"))) {
                        Intent i = getPackageManager().getLaunchIntentForPackage(r.activityInfo.packageName);
                        if (i != null) { startActivity(i); return; }
                    }
                }
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=" + Uri.encode("Synology Secure SignIn"))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                evaluate("toast('Secure SignInが見つからないため、ストアで検索しました')");
            } catch (Exception e) { evaluate("toast('Secure SignInを開けませんでした。端末のアプリ一覧から開いてください')"); }
        }); }

        @JavascriptInterface public void openTailscale() { mainHandler.post(() -> {
            try { Intent i=getPackageManager().getLaunchIntentForPackage("com.tailscale.ipn"); if(i==null)i=getPackageManager().getLeanbackLaunchIntentForPackage("com.tailscale.ipn"); if(i==null)throw new Exception();startActivity(i); }
            catch(Exception e) { evaluate("toast('Tailscaleアプリが見つかりません。端末のアプリ一覧から開いてください')"); }
        }); }

        @JavascriptInterface public boolean isTelevision() { return (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_TYPE_MASK)==android.content.res.Configuration.UI_MODE_TYPE_TELEVISION; }
        @JavascriptInterface public void publishAudioLibrary(String json) { CarLibrary.publish(MainActivity.this,json); }
        @JavascriptInterface public String getAudioPositions() { return CarLibrary.positions(MainActivity.this).toString(); }
        @JavascriptInterface public void pinReadingWidget(boolean rich) { mainHandler.post(()->{
            android.appwidget.AppWidgetManager manager=android.appwidget.AppWidgetManager.getInstance(MainActivity.this);
            if(manager.isRequestPinAppWidgetSupported())manager.requestPinAppWidget(new android.content.ComponentName(MainActivity.this,rich?RichReadingWidgetProvider.class:ReadingWidgetProvider.class),null,null);
            else evaluate("toast('ホーム画面を長押しして、ウィジェットからDSBooksを追加してください')");
        }); }
        @JavascriptInterface public void openCastSettings() { mainHandler.post(()->{try{startActivity(new Intent(android.provider.Settings.ACTION_CAST_SETTINGS));}catch(Exception e){evaluate("toast('この端末には画面共有の設定画面がありません')");}}); }
        @JavascriptInterface public void setModalOpen(boolean open) { webModalOpen = open; }

        @JavascriptInterface public void speakText(String text, float rate, String title, String token) {
            // Chapters can exceed Binder's transaction size; pass a private file, never the whole text in an Intent.
            try {
                File pending=File.createTempFile("speech-",".txt",getCacheDir());
                try(java.io.Writer out=new java.io.OutputStreamWriter(new FileOutputStream(pending),java.nio.charset.StandardCharsets.UTF_8)){out.write(text==null?"":text);}
                mainHandler.post(() -> {Intent i = new Intent(MainActivity.this, MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_SPEAK)
                    .putExtra("speechFile",pending.getName()).putExtra("speed",rate).putExtra("title",title==null?"ePubの読み上げ":title).putExtra("token",token==null?String.valueOf(System.currentTimeMillis()):token);startPlaybackService(i);});
            }catch(Exception e){mainHandler.post(()->evaluate("toast('朗読の準備に失敗しました。空き容量を確認してください')"));}
        }

        @JavascriptInterface public void stopSpeech() {
            mainHandler.post(() -> playbackControl("stop", 0, 1f));
        }

        @JavascriptInterface public void updateWidgetBooks(String json) {
            ReadingWidgetProvider.publish(MainActivity.this, json == null ? "[]" : json);
            prepareWidgetCovers(json);
        }

        @JavascriptInterface public void shareBook(String localName, String mime) {
            mainHandler.post(() -> {
                try {
                    Uri uri = bookUri(localName);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.setClipData(ClipData.newUri(getContentResolver(), "DSBooks", uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "ファイルを共有"));
                } catch (Exception e) { evaluate("window.onBookShareFailed&&window.onBookShareFailed()"); }
            });
        }

        @JavascriptInterface public void exportBook(String localName, String suggestedName, String mime) {
            mainHandler.post(() -> {
                try {
                    if (pendingExportName != null) return;
                    localFile(localName);
                    pendingExportName = localName;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    intent.putExtra(Intent.EXTRA_TITLE, suggestedName == null || suggestedName.isEmpty() ? localName : suggestedName);
                    startActivityForResult(intent, CREATE_DOCUMENT_REQUEST);
                } catch (ActivityNotFoundException e) { pendingExportName = null; evaluate("window.onBookExported&&window.onBookExported(false)"); }
                catch (Exception e) { pendingExportName = null; evaluate("window.onBookExported&&window.onBookExported(false)"); }
            });
        }
        @JavascriptInterface public void downloadBook(String base, String apiPath, String version,
                String sid, String remotePath, String title, String mime, String bookId, long expectedSize) {
            Intent job = new Intent(MainActivity.this, BookDownloadService.class);
            job.putExtra("base", base); job.putExtra("apiPath", apiPath); job.putExtra("version", version); job.putExtra("sid", sid);
            job.putExtra("storageId",BookStorage.selected(MainActivity.this));
            job.putExtra("remotePath", remotePath); job.putExtra("title", title); job.putExtra("mime", mime); job.putExtra("bookId", bookId); job.putExtra("expectedSize", expectedSize);
            try { if (Build.VERSION.SDK_INT >= 26) startForegroundService(job); else startService(job); }
            catch (Exception e) { evaluate("window.onNativeDownload&&window.onNativeDownload({id:" + JSONObject.quote(bookId) + ",ok:false,error:'バックグラウンドダウンロードを開始できませんでした'})"); }
        }

        /** Removes a waiting (not yet started) book from the download queue. */
        @JavascriptInterface public void dequeueDownload(String bookId) {
            try { startService(new Intent(MainActivity.this, BookDownloadService.class).setAction(BookDownloadService.ACTION_DEQUEUE).putExtra("bookId", bookId)); } catch (Exception ignored) { }
        }

        @JavascriptInterface public void controlDownload(String action) {
            Intent control = new Intent(MainActivity.this, BookDownloadService.class);
            if ("pause".equals(action)) control.setAction(BookDownloadService.ACTION_PAUSE);
            else if ("resume".equals(action)) control.setAction(BookDownloadService.ACTION_RESUME);
            else if ("cancel".equals(action)) control.setAction(BookDownloadService.ACTION_CANCEL);
            else return;
            try { startService(control); } catch (Exception ignored) { }
        }

        @JavascriptInterface public String getDownloadState() {
            SharedPreferences prefs = getSharedPreferences("download", MODE_PRIVATE);
            try {
                JSONObject state = new JSONObject(prefs.getString("state", "{}"));
                state.put("result", new JSONObject(prefs.getString("result", "{}")));
                state.put("queue", new JSONArray(prefs.getString("queue", "[]")));
                return state.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public boolean openBook(String localName, String mime) {
            try {
                Uri uri = bookUri(localName);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(intent, "開くアプリを選択"));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface public boolean hasBook(String name) { return BookStorage.exists(MainActivity.this,name); }
        @JavascriptInterface public boolean deleteBook(String name) { return BookStorage.delete(MainActivity.this,name); }
        @JavascriptInterface public String getStorageInfo() { return BookStorage.info(MainActivity.this).toString(); }
        @JavascriptInterface public String setDownloadStorage(String id) {
            try { BookStorage.select(MainActivity.this,id); return ""; }
            catch (Exception e) { return e.getMessage()==null?"保存先を変更できませんでした":e.getMessage(); }
        }

        @JavascriptInterface public void requestBookThumbnail(String localName) {
            thumbnailWorkers.execute(() -> {
                String data = null;
                try {
                    File book = localFile(localName);
                    if (book.isFile()) {
                        File dir = new File(getFilesDir(), "thumbnails");
                        if (!dir.exists()) dir.mkdirs();
                        File thumb = new File(dir, digest(localName) + ".jpg");
                        if (!thumb.isFile() || thumb.length() == 0) createBookThumbnail(book, thumb);
                        if (thumb.isFile() && thumb.length() <= 512 * 1024) {
                            byte[] bytes = new byte[(int) thumb.length()];
                            try (FileInputStream in = new FileInputStream(thumb)) {
                                int at=0,n; while(at<bytes.length&&(n=in.read(bytes,at,bytes.length-at))>0)at+=n;
                            }
                            data = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                        }
                    }
                } catch (Exception ignored) { }
                if(data!=null)ReadingWidgetProvider.refresh(MainActivity.this);
                final String result = data;
                mainHandler.post(() -> evaluate("window.onBookThumbnail&&window.onBookThumbnail(" + JSONObject.quote(localName) + "," + (result == null ? "null" : JSONObject.quote(result)) + ")"));
            });
        }

        @JavascriptInterface public String remoteThumbnailPath(String bookPath, String rootsJson) {
            try {
                JSONArray roots = new JSONArray(rootsJson == null ? "[]" : rootsJson);
                String best = "";
                String normalizedBook = normalizeNasPath(bookPath);
                for (int i = 0; i < roots.length(); i++) {
                    String root = normalizeNasPath(roots.optString(i, ""));
                    if (!root.isEmpty() && normalizedBook.startsWith(root + "/") && root.length() > best.length()) best = root;
                }
                if (best.isEmpty()) return "";
                return best + "/_DSBooksCache/thumbs/" + digest(normalizedBook) + ".jpg";
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public void requestRemoteBookThumbnail(String base, String apiPath,
                String version, String sid, String remotePath, String cacheKey) {
            thumbnailWorkers.execute(() -> fetchRemoteThumbnail(base, apiPath, version, sid, remotePath, cacheKey));
        }

        @JavascriptInterface public void renderPdfPage(String localName, int pageIndex, String token) {
            new Thread(() -> renderPdf(localName, pageIndex, token)).start();
        }

        @JavascriptInterface public String readText(String localName) {
            try {
                File f = localFile(localName);
                if (!f.isFile() || f.length() > 4L * 1024 * 1024) return null;
                byte[] bytes = new byte[(int) f.length()];
                try (FileInputStream in = new FileInputStream(f)) {
                    int offset = 0, n;
                    while (offset < bytes.length && (n = in.read(bytes, offset, bytes.length - offset)) > 0) offset += n;
                }
                return new String(bytes, StandardCharsets.UTF_8);
            } catch (Exception e) { return null; }
        }

        @JavascriptInterface public String getAppVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "preview"; }
        }

        @JavascriptInterface public void saveCredentials(String base, String account, String password, String sid) {
            try {
                JSONObject json = new JSONObject(); json.put("base", base); json.put("account", account);
                json.put("password", password); json.put("sid", sid);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, getCredentialKey());
                byte[] encrypted = cipher.doFinal(json.toString().getBytes(StandardCharsets.UTF_8));
                byte[] combined = new byte[cipher.getIV().length + encrypted.length];
                System.arraycopy(cipher.getIV(), 0, combined, 0, cipher.getIV().length);
                System.arraycopy(encrypted, 0, combined, cipher.getIV().length, encrypted.length);
                getSharedPreferences("secure", MODE_PRIVATE).edit().putString("credentials", Base64.encodeToString(combined, Base64.NO_WRAP)).apply();
            } catch (Exception ignored) { }
        }

        @JavascriptInterface public String loadCredentials() {
            try {
                String value = getSharedPreferences("secure", MODE_PRIVATE).getString("credentials", null);
                if (value == null) return null;
                byte[] all = Base64.decode(value, Base64.NO_WRAP);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, getCredentialKey(), new GCMParameterSpec(128, all, 0, 12));
                return new String(cipher.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
            } catch (Exception e) { return null; }
        }

        @JavascriptInterface public void clearCredentials() { getSharedPreferences("secure", MODE_PRIVATE).edit().remove("credentials").apply(); }

        @JavascriptInterface public String getEpubChapter(String localName, int chapter) {
            try { return extractEpubChapter(localFile(localName), chapter).toString(); }
            catch (Exception e) { JSONObject o = new JSONObject(); try { o.put("ok", false); o.put("error", e.getMessage()); } catch (Exception ignored) { } return o.toString(); }
        }
        @JavascriptInterface public void renderComicPage(String localName,int requested,String token){
            final int request=comicRequest.incrementAndGet();
            comicWorker.execute(()->{
                if(request!=comicRequest.get())return;JSONObject o=new JSONObject();
                try{File file=localFile(localName);String key=file.getCanonicalPath()+":"+file.length()+":"+file.lastModified();
                    if(comicArchive==null||!key.equals(comicKey)){if(comicArchive!=null)comicArchive.close();comicArchive=null;comicArchive=new ComicArchive(file);comicKey=key;}
                    int index=Math.max(0,Math.min(requested,comicArchive.count()-1));byte[] bytes=comicArchive.page(index);
                    o.put("ok",true).put("page",index).put("count",comicArchive.count()).put("name",comicArchive.name(index)).put("image","data:"+EpubContent.mime(comicArchive.name(index))+";base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP));
                }catch(Exception e){try{o.put("ok",false).put("error",e.getMessage()==null?"コミックを開けませんでした":e.getMessage());}catch(Exception ignored){}if(comicArchive!=null)comicArchive.close();comicArchive=null;}
                if(request==comicRequest.get())evaluate("window.onComicPage&&window.onComicPage("+JSONObject.quote(token)+","+o+")");
            });
        }
        @JavascriptInterface public void closeComic(){comicRequest.incrementAndGet();comicWorker.execute(()->{if(comicArchive!=null)comicArchive.close();comicArchive=null;comicKey="";});}
        @JavascriptInterface public String getAudioChapters(String localName) {
            try { return readM4bChapters(localFile(localName)).toString(); }
            catch (Exception e) { return "[]"; }
        }

        @JavascriptInterface public void playAudio(String localName, String token, int positionMs, float speed, String title, String subtitle) {
            mainHandler.post(() -> {
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_PLAY_AUDIO)
                        .putExtra("localName", localName).putExtra("token", token).putExtra("position", (long)positionMs)
                        .putExtra("speed", speed).putExtra("title", title).putExtra("subtitle", subtitle);
                startPlaybackService(i);
            });
        }
        @JavascriptInterface public String playNasAudio(String spec) {
            try {
                JSONObject o = new JSONObject(spec);
                String base = o.getString("base").replaceAll("/+$", "");
                java.net.URL origin = new java.net.URL(base);
                String path = o.optString("apiPath", "entry.cgi").replaceAll("^/+", "");
                if (!(origin.getProtocol().equals("http") || origin.getProtocol().equals("https")) || origin.getUserInfo()!=null
                    || origin.getQuery()!=null || origin.getRef()!=null || !path.matches("[A-Za-z0-9_./-]+") || path.contains("..")) return "接続先が不正です";
                String sid = o.getString("sid"), remote = o.getString("path");
                if (sid.isEmpty() || !remote.startsWith("/")) return "NASに再接続してください";
                String url = base + "/webapi/" + path + "?api=SYNO.FileStation.Download&version=" + Math.max(1,Math.min(2,o.optInt("version",2)))
                    + "&method=download&mode=open&path=" + java.net.URLEncoder.encode(new JSONArray().put(remote).toString(),"UTF-8")
                    + "&_sid=" + java.net.URLEncoder.encode(sid,"UTF-8");
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_PLAY_AUDIO)
                    .putExtra("sourceUrl",url).putExtra("sourceId",o.getString("bookId")).putExtra("sourceBytes",o.optLong("size",0))
                    .putExtra("token",o.getString("token")).putExtra("position",Math.max(0,o.optLong("position",0)))
                    .putExtra("speed",(float)o.optDouble("speed",1)).putExtra("title",o.optString("title","音声本"))
                    .putExtra("subtitle",o.optString("subtitle","") + " · NASストリーミング");
                mainHandler.post(() -> startPlaybackService(i)); return "";
            } catch (Exception e) { return "ストリーミングを開始できません。NAS接続を確認してください。"; }
        }
        @JavascriptInterface public void audioAction(String action, int value) {
            mainHandler.post(() -> playbackControl(action, value, value > 0 && "speed".equals(action) ? value / 100f : 1f));
        }
        @JavascriptInterface public String getPlaybackState() { return CastAudio.isActive()?CastAudio.state():MediaPlaybackService.getState(MainActivity.this); }
        @JavascriptInterface public void playbackAction(String action, long value, float speed) { mainHandler.post(() -> playbackControl(action, value, speed)); }
    }

    private Uri bookUri(String localName) throws Exception {
        File file=localFile(localName);
        if(!file.isFile())throw new java.io.FileNotFoundException();
        // Authority follows the installed application id, so side-by-side builds never share a provider.
        return Uri.parse("content://"+getPackageName()+".files/books/"+Uri.encode(localName));
    }

    private SecretKey getCredentialKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        String alias = "dsbooks.credentials.v1";
        if (!ks.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry)ks.getEntry(alias, null)).getSecretKey();
    }

    private JSONObject extractEpubChapter(File file,int requested) throws Exception {
        EpubContent.Page p=EpubContent.read(file,requested);
        return new JSONObject().put("ok",true).put("index",p.index).put("count",p.count).put("title",p.title).put("html",p.html)
            .put("imageOnly",p.imageOnly).put("images",p.images).put("direction",p.direction).put("progressWeights",readEpubProgressWeights(file));
    }

    private JSONArray readEpubProgressWeights(File file) throws Exception {
        String cacheKey=file.getCanonicalPath()+":"+file.length()+":"+file.lastModified();
        synchronized(epubProgressWeightCache){JSONArray cached=epubProgressWeightCache.get(cacheKey);if(cached!=null)return new JSONArray(cached.toString());}
        JSONArray weights=new JSONArray();
        try(ZipFile zip=new ZipFile(file)){
            DocumentBuilderFactory factory=secureEpubFactory();
            Document container=newEpubBuilder(factory).parse(zip.getInputStream(zip.getEntry("META-INF/container.xml")));
            String opfPath=container.getElementsByTagName("rootfile").item(0).getAttributes().getNamedItem("full-path").getNodeValue();
            Document opf=newEpubBuilder(factory).parse(zip.getInputStream(zip.getEntry(opfPath)));
            String base=opfPath.contains("/")?opfPath.substring(0,opfPath.lastIndexOf('/')+1):"";
            Map<String,String> items=new HashMap<>();NodeList manifest=opf.getElementsByTagName("item");
            for(int i=0;i<manifest.getLength();i++){Element e=(Element)manifest.item(i);items.put(e.getAttribute("id"),e.getAttribute("href"));}
            NodeList spine=opf.getElementsByTagName("itemref");
            for(int i=0;i<spine.getLength();i++){
                try{
                    Element ref=(Element)spine.item(i);String href=items.get(ref.getAttribute("idref"));
                    String path=java.net.URI.create(base).resolve(href).normalize().getPath();if(path.startsWith("/"))path=path.substring(1);
                    ZipEntry entry=zip.getEntry(path);if(entry==null){weights.put(1);continue;}
                    Document doc=newEpubBuilder(factory).parse(zip.getInputStream(entry));
                    NodeList bodies=doc.getElementsByTagName("body");String text=bodies.getLength()>0?bodies.item(0).getTextContent():doc.getDocumentElement().getTextContent();
                    int chars=text==null?0:text.replaceAll("\\s+","").length();weights.put(Math.max(1,chars));
                }catch(Exception ignored){weights.put(1);}
            }
        }
        synchronized(epubProgressWeightCache){epubProgressWeightCache.put(cacheKey,new JSONArray(weights.toString()));}
        return weights;
    }
    private DocumentBuilderFactory secureEpubFactory() throws Exception {
        DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();
        try { f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true); } catch(Exception ignored) { }
        try { f.setFeature("http://xml.org/sax/features/external-general-entities",false); } catch(Exception ignored) { }
        try { f.setFeature("http://xml.org/sax/features/external-parameter-entities",false); } catch(Exception ignored) { }
        try { f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd",false); } catch(Exception ignored) { }
        try { f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,""); } catch(Exception ignored) { }
        try { f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,""); } catch(Exception ignored) { }
        f.setExpandEntityReferences(false);
        try { f.setXIncludeAware(false); } catch(Exception ignored) { }
        return f;
    }
    private DocumentBuilder newEpubBuilder(DocumentBuilderFactory f) throws Exception {
        DocumentBuilder b=f.newDocumentBuilder();
        b.setEntityResolver((publicId,systemId)->new InputSource(new java.io.StringReader("")));
        return b;
    }
    private String escapeAttribute(String v){return v.replace("&","&amp;").replace("\"","&quot;").replace("<","&lt;").replace(">","&gt;");}
    private byte[] readAll(InputStream in, int max) throws Exception { ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(b.size()+n>max)throw new Exception("EPUBの章が大きすぎます");b.write(buf,0,n);}return b.toByteArray(); }

    private JSONArray readM4bChapters(File file) throws Exception {
        JSONArray out=new JSONArray();for(IsoChapterParser.Chapter c:IsoChapterParser.read(file))out.put(new JSONObject().put("title",c.title).put("timeMs",c.timeMs));return out;
    }

    private void startPlaybackService(Intent intent) {
        CastAudio.stopIfActive();
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent); else startService(intent);
    }
    private void playbackControl(String action, long value, float speed) {
        if(CastAudio.isActive()){CastAudio.control(action,value);return;}
        String command = action;
        if ("resume".equals(action)) command = "play";
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_CONTROL)
                .putExtra("command", command).putExtra("value", value).putExtra("speed", speed);
        try { startService(i); } catch (Exception ignored) { }
    }

    private File localFile(String name) throws Exception { return BookStorage.resolve(this,name); }

    private String normalizeNasPath(String path) {
        if (path == null) return "";
        String value = path.replace('\\', '/').replaceAll("/+", "/");
        if (!value.startsWith("/")) value = "/" + value;
        while (value.length() > 1 && value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private void fetchRemoteThumbnail(String base, String apiPath, String version, String sid,
            String remotePath, String cacheKey) {
        String data = null;
        HttpURLConnection conn = null;
        try {
            File dir = new File(getFilesDir(), "thumbnails");
            if (!dir.exists()) dir.mkdirs();
            File target = new File(dir, "remote-" + digest(cacheKey) + ".jpg");
            if (!target.isFile() && base != null && !base.isEmpty() && sid != null && !sid.isEmpty()) {
                String endpoint = base.replaceAll("/$", "") + "/webapi/" + (apiPath == null || apiPath.isEmpty() ? "entry.cgi" : apiPath.replaceAll("^/", ""));
                String query = "api=" + enc("SYNO.FileStation.Download")
                        + "&version=" + enc(version == null || version.isEmpty() ? "2" : version)
                        + "&method=download&path=" + enc(new JSONArray().put(remotePath).toString())
                        + "&mode=" + enc("download") + "&_sid=" + enc(sid);
                conn = (HttpURLConnection) new URL(endpoint + "?" + query).openConnection();
                conn.setRequestMethod("GET"); conn.setConnectTimeout(12000); conn.setReadTimeout(20000);
                conn.setInstanceFollowRedirects(false);
                int status = conn.getResponseCode(); String contentType = conn.getContentType();
                if (status < 200 || status >= 300 || (contentType != null && (contentType.contains("json") || contentType.contains("text/html")))) {
                    readErrorBody(status >= 400 ? conn.getErrorStream() : conn.getInputStream());
                } else {
                    long length = conn.getContentLengthLong();
                    if (length > 1024L * 1024) throw new Exception("thumbnail too large");
                    File partial = new File(dir, target.getName() + ".part");
                    try (InputStream in = new BufferedInputStream(conn.getInputStream()); FileOutputStream out = new FileOutputStream(partial)) {
                        byte[] buffer = new byte[8192]; int n; long total = 0;
                        while ((n = in.read(buffer)) != -1) { total += n; if (total > 1024L * 1024) throw new Exception("thumbnail too large"); out.write(buffer, 0, n); }
                        out.getFD().sync();
                    }
                    Bitmap check = BitmapFactory.decodeFile(partial.getAbsolutePath());
                    if (check != null) { check.recycle(); if (target.exists()) target.delete(); if (!partial.renameTo(target)) partial.delete(); }
                    else partial.delete();
                }
            }
            if (target.isFile() && target.length() > 0 && target.length() <= 1024L * 1024) {
                byte[] bytes = new byte[(int) target.length()];
                try (FileInputStream in = new FileInputStream(target)) { int at=0,n; while(at<bytes.length&&(n=in.read(bytes,at,bytes.length-at))>0)at+=n; }
                data = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
            }
        } catch (Exception ignored) { }
        finally { if (conn != null) conn.disconnect(); }
        if(data!=null)ReadingWidgetProvider.refresh(MainActivity.this);
                final String result = data;
        mainHandler.post(() -> evaluate("window.onRemoteBookThumbnail&&window.onRemoteBookThumbnail(" + JSONObject.quote(cacheKey) + "," + (result == null ? "null" : JSONObject.quote(result)) + ")"));
    }

    private final java.util.concurrent.atomic.AtomicBoolean widgetCoverBusy=new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.Map<String,Long> widgetCoverAttempts=new java.util.concurrent.ConcurrentHashMap<>();
    private void prepareWidgetCovers(String json){
        if(json==null||!widgetCoverBusy.compareAndSet(false,true))return;
        new Thread(()->{boolean changed=false;try{JSONArray items=new JSONArray(json);for(int i=0;i<Math.min(items.length(),200);i++){
            JSONObject b=items.optJSONObject(i);if(b==null)continue;String name=b.optString("localName");if(name.isEmpty())continue;
            File target=new File(new File(getFilesDir(),"thumbnails"),digest(name)+".jpg");if(target.isFile())continue;
            Long last=widgetCoverAttempts.get(name);if(last!=null&&System.currentTimeMillis()-last<600000)continue;widgetCoverAttempts.put(name,System.currentTimeMillis());
            try{File book=localFile(name);if(book.isFile()){createBookThumbnail(book,target);changed|=target.isFile();}}catch(Exception ignored){}
        }}catch(Exception ignored){}finally{widgetCoverBusy.set(false);if(changed)ReadingWidgetProvider.refresh(MainActivity.this);}},"WidgetCovers").start();
    }
    private synchronized void createBookThumbnail(File book, File target) throws Exception {
        if(target.isFile()&&target.length()>0)return;
        String name=book.getName().toLowerCase(Locale.ROOT);Bitmap source=null;
        if(name.endsWith(".pdf")) {
            try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(book,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer renderer=new PdfRenderer(fd)) {
                if(renderer.getPageCount()>0)try(PdfRenderer.Page page=renderer.openPage(0)) {int width=360,height=Math.max(1,(int)(width*(double)page.getHeight()/Math.max(1,page.getWidth())));source=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);source.eraseColor(0xffffffff);page.render(source,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);}
            }
        } else if(name.endsWith(".epub")) source=decodeEpubCover(book);
        else if(name.endsWith(".cbz")||name.endsWith(".cbr")){try(ComicArchive archive=new ComicArchive(book)){source=decodeSampledBitmap(archive.page(0));}}
        else if(name.endsWith(".m4a")||name.endsWith(".m4b")) {MediaMetadataRetriever retriever=new MediaMetadataRetriever();try{retriever.setDataSource(book.getAbsolutePath());byte[] art=retriever.getEmbeddedPicture();if(art!=null)source=decodeSampledBitmap(art);}finally{retriever.release();}}
        if(source==null)return;
        Bitmap cover=Bitmap.createBitmap(320,480,Bitmap.Config.RGB_565);Canvas canvas=new Canvas(cover);canvas.drawColor(0xfff7f5ef);float scale=Math.min(304f/source.getWidth(),464f/source.getHeight());float w=source.getWidth()*scale,h=source.getHeight()*scale;RectF dest=new RectF((320-w)/2f,(480-h)/2f,(320+w)/2f,(480+h)/2f);canvas.drawBitmap(source,null,dest,new Paint(Paint.FILTER_BITMAP_FLAG|Paint.ANTI_ALIAS_FLAG));source.recycle();
        File parent=target.getParentFile();if(parent!=null&&!parent.exists())parent.mkdirs();try(FileOutputStream out=new FileOutputStream(target)){cover.compress(Bitmap.CompressFormat.JPEG,78,out);out.flush();}finally{cover.recycle();}
    }

    private Bitmap decodeEpubCover(File file) {
        try(ZipFile zip=new ZipFile(file)) {
            DocumentBuilderFactory f=secureEpubFactory();ZipEntry ce=zip.getEntry("META-INF/container.xml");if(ce==null)return null;
            Document container=newEpubBuilder(f).parse(zip.getInputStream(ce));String opfPath=container.getElementsByTagName("rootfile").item(0).getAttributes().getNamedItem("full-path").getNodeValue();ZipEntry oe=zip.getEntry(opfPath);if(oe==null)return null;Document opf=newEpubBuilder(f).parse(zip.getInputStream(oe));
            String base=opfPath.contains("/")?opfPath.substring(0,opfPath.lastIndexOf('/')+1):"";java.util.Map<String,String> hrefs=new java.util.HashMap<>();String coverId="",coverHref="";NodeList items=opf.getElementsByTagName("item");
            for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);String id=e.getAttribute("id"),href=e.getAttribute("href");hrefs.put(id,href);if(e.getAttribute("properties").contains("cover-image"))coverHref=href;}
            NodeList metas=opf.getElementsByTagName("meta");for(int i=0;i<metas.getLength();i++){Element e=(Element)metas.item(i);if("cover".equalsIgnoreCase(e.getAttribute("name")))coverId=e.getAttribute("content");}
            if(coverHref.isEmpty()&&!coverId.isEmpty())coverHref=hrefs.get(coverId);
            if(coverHref==null||coverHref.isEmpty())for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);String h=e.getAttribute("href");if(e.getAttribute("media-type").startsWith("image/")&&h.toLowerCase(Locale.ROOT).matches(".*(cover|title.?page).*")){coverHref=h;break;}}
            if(coverHref==null||coverHref.isEmpty())for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);if(e.getAttribute("media-type").startsWith("image/")){coverHref=e.getAttribute("href");break;}}
            if(coverHref==null||coverHref.isEmpty())return null;String path=java.net.URI.create(base).resolve(coverHref).normalize().getPath();if(path.startsWith("/"))path=path.substring(1);ZipEntry image=zip.getEntry(path);if(image==null||image.getSize()<=0||image.getSize()>12L*1024*1024)return null;byte[] bytes;try(InputStream in=zip.getInputStream(image)){bytes=readAll(in,12*1024*1024);}return decodeSampledBitmap(bytes);
        }catch(Exception e){return null;}
    }

    private Bitmap decodeSampledBitmap(byte[] bytes) {
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth<1||bounds.outHeight<1)return null;int sample=1;while(bounds.outWidth/sample>900||bounds.outHeight/sample>1200)sample*=2;BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=sample;options.inPreferredConfig=Bitmap.Config.RGB_565;return BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
    }

    private void renderPdf(String localName, int pageIndex, String token) {
        JSONObject result = new JSONObject();
        try {
            File file = localFile(localName);
            try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer renderer = new PdfRenderer(descriptor)) {
                int count = renderer.getPageCount();
                if (count < 1) throw new Exception("PDFにページがありません");
                int index = Math.max(0, Math.min(pageIndex, count - 1));
                try (PdfRenderer.Page page = renderer.openPage(index)) {
                    int width = 1200;
                    int height = Math.max(1, Math.min(2400, (int) (width * (double) page.getHeight() / Math.max(1, page.getWidth()))));
                    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                    bitmap.eraseColor(0xffffffff);
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 82, bytes);
                    bitmap.recycle();
                    result.put("ok", true);
                    result.put("page", index);
                    result.put("count", count);
                    result.put("image", "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                }
            }
        } catch (Exception e) {
            try { result.put("ok", false); result.put("error", e.getMessage() == null ? "PDFを表示できませんでした" : e.getMessage()); }
            catch (Exception ignored) { }
        }
        String payload = result.toString();
        mainHandler.post(() -> evaluate("window.onPdfPage && window.onPdfPage(" + JSONObject.quote(token) + "," + payload + ")"));
    }

    private String readErrorBody(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream source = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n; int remaining = 64 * 1024;
            while (remaining > 0 && (n = source.read(buffer, 0, Math.min(buffer.length, remaining))) != -1) {
                out.write(buffer, 0, n); remaining -= n;
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void evaluate(String script) { if (android.os.Looper.myLooper()!=android.os.Looper.getMainLooper()) { mainHandler.post(() -> evaluate(script)); return; } if (webView != null && !isDestroyed()) webView.evaluateJavascript(script, null); }

    private void deliverDownloadState() {
        if (!pageReady || webView == null) return;
        String json = new NativeBridge().getDownloadState();
        evaluate("window.restoreDownloadState&&window.restoreDownloadState(" + json + ")");
    }

    private void deliverPlaybackState() {
        if (!pageReady || webView == null) return;
        evaluate("window.onPlaybackState&&window.onPlaybackState(JSON.parse(" + JSONObject.quote(CastAudio.isActive()?CastAudio.state():MediaPlaybackService.getState(this)) + "))");
    }

    private String enc(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < 16; i++) out.append(String.format(Locale.ROOT, "%02x", bytes[i] & 0xff));
            return out.toString();
        } catch (Exception e) { return Integer.toHexString(value.hashCode()); }
    }
}
