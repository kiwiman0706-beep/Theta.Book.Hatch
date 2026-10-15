package jp.shinwakai.dsbooks.preview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.media.MediaMetadata;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.interfaces.IMedia;
import org.json.JSONArray;

import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONObject;

import java.io.File;


import java.util.Locale;

/** Owns audiobook and EPUB TTS playback across Activity/navigation changes. */
public final class MediaPlaybackService extends Service {
    public static final String ACTION_EVENT = "jp.shinwakai.dsbooks.preview.PLAYBACK_EVENT";
    public static final String ACTION_PLAY_AUDIO = "jp.shinwakai.dsbooks.preview.PLAY_AUDIO";
    public static final String ACTION_SPEAK = "jp.shinwakai.dsbooks.preview.SPEAK_TEXT";
    public static final String ACTION_CONTROL = "jp.shinwakai.dsbooks.preview.PLAYBACK_CONTROL";
    private static final String CHANNEL = "dsbooks_media";
    private static final int NOTIFICATION_ID = 7410;
    private static volatile boolean serviceAlive;
    private static final String PREFS = "media_playback";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private boolean preparing, ready, wantPlay;
    private LibVLC vlc;
    private android.os.PowerManager.WakeLock audioWakeLock;
    private long pendingSeek = -1, seekRequestedAt;
    private boolean audioEnded;
    private String playbackError = "", playbackStatus = "";
    private int generation;
    private Runnable prepareTimeout;
    private JSONObject audioDiagnostic = new JSONObject();
    private TextToSpeech tts;
    private boolean ttsReady;
    private MediaSession session;
    private String token = "";
    private String title = "DSBooks";
    private String subtitle = "";
    private String kind = "";
    private String localName = "";
    private String sourceId = "", sourceUrl = "";
    private long sourceBytes;
    private NasAudioSource nasAudio;
    private JSONArray streamChapters = new JSONArray();
    private String speech = "";
    private final SpeechCursor speechCursor = new SpeechCursor();
    private float speed = 1f;
    private boolean playing;
    private long position;
    private long duration;
    private Runnable ticker;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean resumeOnFocusGain;
    private long lastSpeechProgressPublish;
    private long lastCarPersist;
    private android.graphics.Bitmap sessionArt;
    private final java.util.concurrent.ExecutorService browserWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private long sleepDeadline;
    private android.os.PowerManager.WakeLock sleepWakeLock;
    private final Runnable sleepCheck = new Runnable() { @Override public void run() {
        if (sleepDeadline == 0) return;
        if (android.os.SystemClock.elapsedRealtime() >= sleepDeadline) { cancelSleep(); resumeOnFocusGain = false; pause(); }
        else handler.postDelayed(this, 1000);
    }};
    private final android.content.BroadcastReceiver noisyReceiver = new android.content.BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { if (playing) pause(); }
    };
    private void cancelSleep() {
        sleepDeadline = 0; handler.removeCallbacks(sleepCheck);
        if (sleepWakeLock != null && sleepWakeLock.isHeld()) sleepWakeLock.release();
    }
    private void setSleep(long minutes) {
        cancelSleep();
        if (minutes > 0 && !kind.isEmpty()) {
            long ms = Math.min(120, minutes) * 60000;
            sleepDeadline = android.os.SystemClock.elapsedRealtime() + ms;
            if (sleepWakeLock == null) sleepWakeLock = ((android.os.PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "DSBooks:sleepTimer");
            sleepWakeLock.acquire(ms + 5000); handler.post(sleepCheck);
        }
        publish();
    }
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> handler.post(() -> {
        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (resumeOnFocusGain) { resumeOnFocusGain = false; play(); }
        } else if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            resumeOnFocusGain = change != AudioManager.AUDIOFOCUS_LOSS && playing;
            pause();
        }
    });

    @Override public void onCreate() {
        super.onCreate();
        serviceAlive = true;
        createChannel();
        registerReceiver(noisyReceiver, new android.content.IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        audioManager = (AudioManager)getSystemService(AUDIO_SERVICE);
        session = new MediaSession(this, "DSBooksPlayback");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { play(); }
            @Override public void onPlayFromMediaId(String id, Bundle extras) { playCarBook(id); }
            @Override public void onPlayFromSearch(String query, Bundle extras) { playCarSearch(query); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { stopPlayback(); }
            @Override public void onSeekTo(long pos) { seek(pos); }
            @Override public void onRewind() { seek(Math.max(0, position - 15000)); }
            @Override public void onFastForward() { seek(position + 15000); }
            @Override public void onSkipToNext() { seek(position + 15000); }
            @Override public void onSkipToPrevious() { seek(Math.max(0, position - 15000)); }
            @Override public void onSetPlaybackSpeed(float value) { setSpeed(value); }
        });
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setActive(true);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(Locale.JAPAN);
                ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED;
                if (ttsReady && "tts".equals(kind) && !speech.isEmpty() && !playing && speechCursor.wanted) speakFromOffset();
            }
        });
        tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { handler.post(() -> {if ("tts".equals(kind)&&speechCursor.begin(id)){playing=true;publish();}}); }
            @Override public void onDone(String id) { handler.post(() -> {if(!"tts".equals(kind)||!speechCursor.finish(id))return;position=speechCursor.position;if(!speechCursor.completed)speakFromOffset();else{playing=false;position=duration;publish();}}); }
            @Override public void onError(String id) { handler.post(() -> {if(speechCursor.accepts(id)){speechCursor.cancel();playing=false;emitError("読み上げを続けられませんでした。再生を押して再開してください。");}}); }
            @Override public void onError(String id,int code){onError(id);}
            @Override public void onRangeStart(String id,int start,int end,int frame){handler.post(() -> {if(speechCursor.range(id,start,end)){position=speechCursor.position;emitState();}});}
        });
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_PLAY_AUDIO.equals(action)) startAudio(intent);
        else if (ACTION_SPEAK.equals(action)) startSpeech(intent);
        else if (ACTION_CONTROL.equals(action)) control(intent.getStringExtra("command"), intent.getLongExtra("value", 0), intent.getFloatExtra("speed", speed));
        return START_NOT_STICKY;
    }

    private void startAudio(Intent intent) {
        CastAudio.stopIfActive();
        stopCurrent(false);
        token = value(intent, "token", String.valueOf(System.currentTimeMillis()));
        title = value(intent, "title", "オーディオブック");
        subtitle = value(intent, "subtitle", "DSBooks · オーディオブック");
        localName = value(intent, "localName", "");
        sourceId = value(intent, "sourceId", ""); sourceUrl = value(intent, "sourceUrl", "");
        sourceBytes = intent.getLongExtra("sourceBytes", 0);
        kind = "audio";
        sessionArt = null; loadSessionArt(localName);
        position = Math.max(0, intent.getLongExtra("position", 0));
        speed = clamp(intent.getFloatExtra("speed", 1f), .5f, 3f);
        speech = ""; speechCursor.position = 0; duration = 0; playing = false;
        startForeground(NOTIFICATION_ID, buildNotification("再生準備中"));
        wantPlay = true; preparing = true; playbackStatus = "再生準備中…";
        audioDiagnostic = new JSONObject(); publish();
        try {
            if (!requestAudioFocus()) throw new Exception("AUDIO_FOCUS");
            if (!sourceUrl.isEmpty()) {
                nasAudio = new NasAudioSource(sourceUrl, sourceBytes);
                diagnostic("source", "nas-stream"); diagnostic("sourceBytes", sourceBytes);
                prepareAudio(android.net.Uri.parse(nasAudio.uri())); return;
            }
            diagnostic("source", "local");
            File file = BookStorage.resolve(this,localName);
            if (!file.isFile()) throw new Exception("MISSING_FILE");
            diagnostic("sourceBytes", file.length());
            prepareAudio(android.net.Uri.fromFile(file));
        } catch (Exception e) { failAudio("音声ファイルを開けません（" + safeCode(e) + "）。詳細・管理から診断レポートを作成してください。"); }
    }

    private void diagnostic(String key, Object value) {
        try { audioDiagnostic.put(key, value); } catch (Exception ignored) { }
        getSharedPreferences("audio_diagnostic", MODE_PRIVATE).edit().putString("file", localName)
                .putString("report", audioDiagnostic.toString()).apply();
    }
    private String safeCode(Exception e) {
        String m = e.getMessage();
        return m != null && m.matches("COMPAT_[A-Z_]+|AUDIO_FOCUS|MISSING_FILE") ? m : e.getClass().getSimpleName();
    }
    private void audioWake(boolean hold) {
        if (audioWakeLock == null) audioWakeLock = ((android.os.PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "DSBooks:audioPlayback");
        if (hold && !audioWakeLock.isHeld()) audioWakeLock.acquire();
        else if (!hold && audioWakeLock.isHeld()) audioWakeLock.release();
    }
    private void releasePlayer() {
        if (prepareTimeout != null) handler.removeCallbacks(prepareTimeout);
        prepareTimeout = null; ready = false; audioWake(false);
        if (player != null) { player.setEventListener(null); try { player.release(); } catch (Exception ignored) { } player = null; }
    }
    private void prepareAudio(android.net.Uri uri) {
        releasePlayer();
        final int ticket = generation;
        preparing = true; playing = false; playbackError = ""; audioEnded = false;
        playbackStatus = sourceUrl.isEmpty() ? "内蔵VLCで再生準備中…" : "NASからストリーミング準備中…";
        diagnostic("engine", "LibVLC"); diagnostic("bindingVersion", "3.7.1");
        diagnostic("stage", "vlc-opening"); publish();
        try {
            if (vlc == null) { System.loadLibrary("c++_shared"); System.loadLibrary("vlc"); System.loadLibrary("vlcjni"); vlc = new LibVLC(this, new java.util.ArrayList<>(java.util.Arrays.asList("--no-video", "--no-spu", "--no-osd", "--no-metadata-network-access"))); }
            diagnostic("engineVersion", LibVLC.version());
            MediaPlayer mp = new MediaPlayer(vlc); player = mp;
            mp.setEventListener(event -> handler.post(() -> {
                if (ticket != generation || player != mp) return;
                try {
                    switch (event.type) {
                        case MediaPlayer.Event.Opening: break;
                        case MediaPlayer.Event.Playing:
                            if (prepareTimeout != null) handler.removeCallbacks(prepareTimeout);
                            prepareTimeout = null;
                            ready = true; preparing = false; playbackStatus = "";
                            duration = Math.max(0, mp.getLength());
                            applyPendingSeek();
                            if (!wantPlay) { mp.pause(); playing = false; audioWake(false); }
                            else { playing = true; audioWake(true); applyAudioSpeed(); startTicker(); }
                            if (nasAudio != null) { diagnostic("rangeSupported",nasAudio.rangeSupported()); diagnostic("receivedBytes",nasAudio.receivedBytes()); }
                            diagnostic("stage", "vlc-playing"); diagnostic("durationMs", duration); recordVlcTracks(); recordStreamChapters(); publish(); break;
                        case MediaPlayer.Event.Paused:
                            playing = false; audioWake(false); stopTicker(); publish(); break;
                        case MediaPlayer.Event.SeekableChanged:
                            if (event.getSeekable()) applyPendingSeek(); break;
                        case MediaPlayer.Event.ESAdded:
                            if (ready) { recordVlcTracks(); recordStreamChapters(); } break;
                        case MediaPlayer.Event.LengthChanged:
                            duration = Math.max(0, event.getLengthChanged()); diagnostic("durationMs", duration); break;
                        case MediaPlayer.Event.Buffering:
                            if (!sourceUrl.isEmpty() && ready) { playbackStatus = event.getBuffering() < 100 ? "NASから読み込み中…" : ""; publish(); } break;
                        case MediaPlayer.Event.EndReached:
                            audioEnded = true; position = duration; pendingSeek = -1; wantPlay = false; playing = false;
                            stopTicker(); audioWake(false); diagnostic("stage", "vlc-ended"); publish(); break;
                        case MediaPlayer.Event.EncounteredError:
                            diagnostic("vlcEvent", event.type); failAudio("内蔵VLCで音声を開けませんでした。「再生を診断」からレポートを作成してください。"); break;
                        default: break;
                    }
                } catch (Exception e) { diagnostic("exceptionClass", e.getClass().getSimpleName()); failAudio("音声の再生操作に失敗しました。「再生を診断」からレポートを作成してください。"); }
            }));
            Media media = new Media(vlc, uri);
            try {
                media.setHWDecoderEnabled(false, false);
                media.addOption(":no-video"); media.addOption(":no-spu");
                if (!sourceUrl.isEmpty()) media.addOption(":network-caching=2000");
                if (position > 0) media.addOption(":start-time=" + String.format(Locale.ROOT, "%.3f", position / 1000.0));
                mp.setMedia(media);
            } finally { media.release(); }
            pendingSeek = position > 0 ? position : -1; seekRequestedAt = android.os.SystemClock.elapsedRealtime();
            audioWake(true); mp.play();
            prepareTimeout = () -> { if (ticket == generation && player == mp && preparing) { diagnostic("stageBeforeFailure", "vlc-prepare-timeout"); failAudio("内蔵VLCの準備が時間内に完了しませんでした。「再生を診断」からレポートを作成してください。"); } };
            handler.postDelayed(prepareTimeout, 60000);
        } catch (LinkageError e) { diagnostic("exceptionClass", e.getClass().getSimpleName()); failAudio("内蔵VLCを読み込めませんでした。「再生を診断」からレポートを作成してください。"); }
          catch (Exception e) { diagnostic("exceptionClass", e.getClass().getSimpleName()); failAudio("内蔵VLCの初期化に失敗しました。「再生を診断」からレポートを作成してください。"); }
    }
    private void recordStreamChapters() {
        if (nasAudio == null || player == null || streamChapters.length() > 0) return;
        try {
            MediaPlayer.Chapter[] chapters = player.getChapters(player.getTitle());
            if (chapters != null) for (MediaPlayer.Chapter c : chapters)
                streamChapters.put(new JSONObject().put("title", c.name == null ? "チャプター" : c.name).put("timeMs", Math.max(0,c.timeOffset)));
        } catch (Exception ignored) { }
    }
    private void recordVlcTracks() {
        IMedia media = player == null ? null : player.getMedia();
        if (media == null) return;
        try {
            JSONArray tracks = new JSONArray();
            for (int i=0; i<media.getTrackCount(); i++) {
                IMedia.Track track = media.getTrack(i);
                if (!(track instanceof IMedia.AudioTrack)) continue;
                IMedia.AudioTrack audio = (IMedia.AudioTrack)track;
                tracks.put(new JSONObject().put("codec", audio.codec).put("fourcc", audio.fourcc).put("channels", audio.channels).put("sampleRate", audio.rate).put("bitrate", audio.bitrate));
            }
            diagnostic("vlcAudioTracks", tracks);
        } catch (Exception ignored) { } finally { media.release(); }
    }
    private void applyPendingSeek() {
        if (player != null && pendingSeek >= 0 && player.isSeekable()) {
            if (duration > 0) pendingSeek = Math.min(pendingSeek, duration);
            player.setTime(pendingSeek, false); seekRequestedAt = android.os.SystemClock.elapsedRealtime();
        }
    }
    private void failAudio(String message) {
        position = getPosition();
        if (nasAudio != null) {
            String code = nasAudio.error(); diagnostic("streamError", code);
            diagnostic("rangeSupported", nasAudio.rangeSupported()); diagnostic("receivedBytes", nasAudio.receivedBytes());
            if ("STREAM_AUTH".equals(code)) message = "NASのログインが切れました。「NASに再接続して再試行」を押してください。";
            else if ("STREAM_RANGE_UNSUPPORTED".equals(code)) message = "このNAS接続では途中位置の読み込みに対応していません。端末に保存してから開いてください。";
            else if ("STREAM_FILE_CHANGED".equals(code)) message = "NASのファイルサイズが変わっています。本棚を再スキャンしてください。";
            else message = "ストリーミングを続けられません（" + (code.isEmpty() ? "STREAM_PLAYBACK" : code) + "）。接続を確認して再試行するか、端末に保存して開いてください。";
            nasAudio.close(); nasAudio = null;
        }
        releasePlayer(); preparing = false; playing = false; wantPlay = false; stopTicker();
        playbackStatus = ""; diagnostic("stage", "failed"); emitError(message);
    }
    private void applyAudioSpeed() {
        if (player != null && ready) try { player.setRate(speed); } catch (Exception ignored) { }
    }

    private void startSpeech(Intent intent) {
        CastAudio.stopIfActive();
        stopCurrent(false);
        token = value(intent, "token", String.valueOf(System.currentTimeMillis()));
        title = value(intent, "title", "ePubの読み上げ");
        subtitle = "DSBooks · テキスト読み上げ";
        kind = "tts";
        speech = "";
        try {String name=value(intent,"speechFile","");File f=new File(getCacheDir(),name);
            if(name.startsWith("speech-")&&name.endsWith(".txt")&&f.getCanonicalFile().getParentFile().equals(getCacheDir().getCanonicalFile())){
                try {if(f.length()>16*1024*1024)throw new java.io.IOException("Speech too long");speech=new String(java.nio.file.Files.readAllBytes(f.toPath()),java.nio.charset.StandardCharsets.UTF_8);}finally{f.delete();}
            }
        }catch(Exception ignored){}
        speechCursor.reset(speech); position = 0; duration = speech.length();
        speed = clamp(intent.getFloatExtra("speed", 1f), .5f, 2.5f); playing = false; localName = "";
        startForeground(NOTIFICATION_ID, buildNotification("読み上げ準備中"));
        publish();
        if (speech.trim().isEmpty()) { emitError("読み上げる本文がありません"); return; }
        if(!requestAudioFocus()){speechCursor.cancel();return;}
        if (ttsReady) speakFromOffset();
    }

    private void speakFromOffset() {
        if(!ttsReady)return;
        String part=speechCursor.next(token);
        tts.stop();tts.setSpeechRate(speed);playbackError="";
        position=speechCursor.position;
        if(part==null){playing=false;publish();return;}
        playing=true;
        if(tts.speak(part,TextToSpeech.QUEUE_FLUSH,null,speechCursor.id)==TextToSpeech.ERROR){speechCursor.cancel();playing=false;emitError("読み上げを開始できませんでした");return;}
        publish();
    }

    private void control(String command, long value, float requestedSpeed) {
        if ("sleep".equals(command)) setSleep(value);
        else if ("pause".equals(command)) pause();
        else if ("play".equals(command) || "resume".equals(command)) play();
        else if ("stop".equals(command)) stopPlayback();
        else if ("seek".equals(command)) seek(value);
        else if ("back".equals(command)) seek(Math.max(0, getPosition() - 15000));
        else if ("forward".equals(command)) seek(getPosition() + 15000);
        else if ("speed".equals(command)) setSpeed(requestedSpeed);
    }

    private Intent restartAudioIntent(long pos) {
        return new Intent().putExtra("token",token).putExtra("title",title).putExtra("subtitle",subtitle)
            .putExtra("localName",localName).putExtra("position",pos).putExtra("speed",speed)
            .putExtra("sourceId",sourceId).putExtra("sourceUrl",sourceUrl).putExtra("sourceBytes",sourceBytes);
    }
    private void play() {
        if (!requestAudioFocus()) return;
        if ("audio".equals(kind)) {
            wantPlay = true;
            if (preparing) return;
            if (!playbackError.isEmpty() || player == null) {
                startAudio(restartAudioIntent(position));
                return;
            }
            try {
                if (audioEnded) { startAudio(restartAudioIntent(0L)); return; }
                audioWake(true); player.play();
            } catch (Exception e) { failAudio("再生を再開できませんでした。もう一度再生してください。"); }
        }
        else if ("tts".equals(kind)) { speechCursor.wanted=true; if (speechCursor.position >= speech.length()) speechCursor.position = 0; if (ttsReady) speakFromOffset(); }
    }
    private void pause() {
        wantPlay = false;
        if ("audio".equals(kind) && player != null && ready) { try { if (player.isPlaying()) player.pause(); position = getPosition(); } catch (Exception ignored) { } stopTicker(); }
        else if ("tts".equals(kind)) { speechCursor.cancel(); if(tts!=null)tts.stop(); }
        playing = false; audioWake(false); publish();
    }
    private void seek(long target) {
        long bounded = Math.max(0, duration > 0 ? Math.min(target, duration) : target);
        if ("audio".equals(kind)) { position = bounded; pendingSeek = bounded; if (player != null && ready && !preparing) try { applyPendingSeek(); } catch (Exception ignored) { } }
        else if ("tts".equals(kind)) { speechCursor.position = (int)Math.min(speech.length(), bounded); position = speechCursor.position; if (playing) speakFromOffset(); }
        publish();
    }
    private void setSpeed(float value) {
        speed = clamp(value, .5f, "tts".equals(kind) ? 2.5f : 3f);
        if ("audio".equals(kind)) applyAudioSpeed();
        else if ("tts".equals(kind) && playing) speakFromOffset();
        publish();
    }
    private void stopPlayback() { stopCurrent(true); }
    private void stopCurrent(boolean clear) {
        speechCursor.cancel();
        persistAudioPosition();
        sessionArt = null;
        stopTicker(); generation++;
        if (nasAudio != null) { nasAudio.close(); nasAudio = null; }
        sourceUrl = ""; sourceId = ""; sourceBytes = 0; streamChapters = new JSONArray();
        releasePlayer(); pendingSeek = -1; audioEnded = false;
        preparing = false; wantPlay = false; playbackError = ""; playbackStatus = "";
        if (tts != null) try { tts.stop(); } catch (Exception ignored) { }
        playing = false;
        if (clear) {
            cancelSleep();
            kind = ""; localName = ""; speech = ""; title = "DSBooks"; subtitle = ""; token = ""; position = 0; duration = 0;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
            abandonAudioFocus();
            updateSession(); emitState(); stopForeground(true); stopSelf();
        }
    }

    private void startTicker() { stopTicker(); ticker = new Runnable() { @Override public void run() { if (player != null) { try { position = getPosition(); duration = Math.max(0, player.getLength()); } catch (Exception ignored) { } publish(); if (playing) handler.postDelayed(this, 1000); } } }; handler.post(ticker); }
    private void stopTicker() { if (ticker != null) handler.removeCallbacks(ticker); ticker = null; }
    private long getPosition() {
        if (audioEnded) return position;
        if ("audio".equals(kind) && player != null && ready && !preparing) try {
            long actual = player.getTime();
            if (pendingSeek >= 0) {
                if (actual >= 0 && Math.abs(actual - pendingSeek) < 2000) pendingSeek = -1;
                else if (android.os.SystemClock.elapsedRealtime() - seekRequestedAt < 10000) return position;
                else pendingSeek = -1;
            }
            if (actual >= 0) return actual;
        } catch (Exception ignored) { }
        return position;
    }

    private void publish() {
        position = getPosition();
        if (!playing || System.currentTimeMillis()-lastCarPersist>5000) persistAudioPosition();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("state", stateJson().toString()).apply();
        updateSession(); emitState();
        if (!kind.isEmpty()) { NotificationManager nm = getSystemService(NotificationManager.class); if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(!playbackError.isEmpty() ? "再生エラー" : preparing ? playbackStatus : playing ? "再生中" : "一時停止中")); }
    }
    private JSONObject stateJson() {
        JSONObject o = new JSONObject();
        try { if("tts".equals(kind)){o.put("rangeStart",speechCursor.rangeStart);o.put("rangeEnd",speechCursor.rangeEnd);o.put("rangeExact",speechCursor.exact);o.put("speechCompleted",speechCursor.completed);} o.put("sourceId", sourceId); o.put("streaming", !sourceUrl.isEmpty()); o.put("chapters",streamChapters); o.put("preparing", preparing); o.put("status", playbackStatus); if (!playbackError.isEmpty()) o.put("error", playbackError); o.put("token", token); o.put("title", title); o.put("subtitle", subtitle); o.put("kind", kind); o.put("localName", localName); o.put("playing", playing); o.put("position", position); o.put("duration", duration); o.put("speed", speed); o.put("active", !kind.isEmpty()); o.put("sleepRemainingMs", sleepDeadline == 0 ? 0 : Math.max(0, sleepDeadline - android.os.SystemClock.elapsedRealtime())); }
        catch (Exception ignored) { }
        return o;
    }
    public static String getState(Context context) { if (!serviceAlive) return "{\"active\":false}"; return context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("state", "{\"active\":false}"); }
    private void emitState() { Intent i = new Intent(ACTION_EVENT).setPackage(getPackageName()).putExtra("state", stateJson().toString()); sendBroadcast(i); }
    private void emitError(String error) { playbackError = error; publish(); }

    private void updateSession() {
        if (session == null) return;
        MediaMetadata.Builder metadata = new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle);
        if(sessionArt!=null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART,sessionArt).putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON,sessionArt);
        if (duration > 0 && "audio".equals(kind)) metadata.putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        session.setMetadata(metadata.build());
        long actions = PlaybackState.ACTION_PLAY_FROM_MEDIA_ID | PlaybackState.ACTION_PLAY_FROM_SEARCH | PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SET_PLAYBACK_SPEED;
        PlaybackState state = new PlaybackState.Builder().setErrorMessage(playbackError).setActions(actions).setState(!playbackError.isEmpty() ? PlaybackState.STATE_ERROR : kind.isEmpty() ? PlaybackState.STATE_STOPPED : preparing ? PlaybackState.STATE_BUFFERING : playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, speed).build();
        session.setPlaybackState(state);
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attrs).setOnAudioFocusChangeListener(focusListener, handler).setWillPauseWhenDucked(true).build();
            return audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        else audioManager.abandonAudioFocus(focusListener);
        resumeOnFocusGain = false;
    }

    private Notification buildNotification(String status) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title).setContentText(subtitle.isEmpty() ? status : subtitle + " · " + status).setContentIntent(content).setOngoing(playing || preparing).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC);
        b.addAction(action(android.R.drawable.ic_media_rew, "15秒戻す", "back"));
        b.addAction(action(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "一時停止" : "再生", playing ? "pause" : "play"));
        b.addAction(action(android.R.drawable.ic_media_ff, "15秒進める", "forward"));
        b.addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "停止", "stop"));
        if(sessionArt!=null)b.setLargeIcon(sessionArt);
        if (session != null) b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }
    private Notification.Action action(int icon, String label, String command) {
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(ACTION_CONTROL).putExtra("command", command);
        PendingIntent pi = PendingIntent.getService(this, command.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(icon, label, pi).build();
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) { NotificationChannel c = new NotificationChannel(CHANNEL, "DSBooksの再生", NotificationManager.IMPORTANCE_LOW); c.setDescription("音声本とePub読み上げの再生操作"); c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); getSystemService(NotificationManager.class).createNotificationChannel(c); }
    }
    private String value(Intent i, String key, String fallback) { String v = i.getStringExtra(key); return v == null ? fallback : v; }
    private float clamp(float v, float min, float max) { return Math.max(min, Math.min(max, v)); }
    private void persistAudioPosition(){if("audio".equals(kind)&&ready){position=getPosition();CarLibrary.savePosition(this,localName,position,duration,speed);lastCarPersist=System.currentTimeMillis();}}
    private void loadSessionArt(String local){
        final String expected=local;
        browserWorker.execute(()->{try{JSONObject found=new JSONObject().put("localName",expected);JSONArray items=CarLibrary.books(this);for(int i=0;i<items.length();i++)if(expected.equals(items.getJSONObject(i).optString("localName"))){found=items.getJSONObject(i);break;}
            final android.graphics.Bitmap bitmap=new ReadingWidgetService.Factory(this,true).cover(found);
            handler.post(()->{if("audio".equals(kind)&&localName.equals(expected)){sessionArt=bitmap;publish();}});
        }catch(Exception ignored){}});
    }
    public final class LocalBinder extends android.os.Binder { android.media.session.MediaSession.Token token(){return session.getSessionToken();} }
    @Override public IBinder onBind(Intent intent){return new LocalBinder();}
    private void playCarBook(String id){
        JSONObject b=CarLibrary.find(this,id);
        if(b==null||!BookStorage.exists(this,b.optString("localName"))){playbackError="端末に保存した音声本が見つかりません。スマートフォンで本棚を確認してください。";updateSession();return;}
        Intent i=new Intent(this,MediaPlaybackService.class).setAction(ACTION_PLAY_AUDIO).putExtra("localName",b.optString("localName")).putExtra("sourceId",b.optString("id")).putExtra("title",b.optString("title")).putExtra("subtitle",b.optString("folder")).putExtra("token","car-"+System.currentTimeMillis()).putExtra("position",CarLibrary.resume(this,b)).putExtra("speed",(float)b.optDouble("audioSpeed",1));
        startForegroundService(i);
    }
    private void playCarSearch(String query){String q=query==null?"":query.trim().toLowerCase(Locale.ROOT);JSONArray items=CarLibrary.books(this);for(int i=0;i<items.length();i++){JSONObject b=items.optJSONObject(i);if(b!=null&&b.optString("title").toLowerCase(Locale.ROOT).contains(q)&&BookStorage.exists(this,b.optString("localName"))){playCarBook(b.optString("id"));return;}}playbackError="一致する保存済みの音声本がありません";updateSession();}

    @Override public void onDestroy() {
        serviceAlive = false;
        browserWorker.shutdown();
        cancelSleep();
        unregisterReceiver(noisyReceiver);
        stopCurrent(false);
        if (tts != null) { try { tts.shutdown(); } catch (Exception ignored) { } tts = null; }
        if (session != null) { session.setActive(false); session.release(); session = null; }
        if (vlc != null) { vlc.release(); vlc = null; }
        super.onDestroy();
    }
}
