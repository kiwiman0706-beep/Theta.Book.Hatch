package jp.shinwakai.dsbooks.preview;

import android.app.*;
import android.content.*;
import android.net.*;
import android.os.*;
import android.widget.*;
import androidx.mediarouter.media.*;
import com.google.android.gms.cast.*;
import com.google.android.gms.cast.framework.*;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import org.json.*;
import java.net.*;
import java.util.*;

/** Lazily initialized sender; the phone serves only the user-selected saved file. */
final class CastAudio {
    private static CastAudio instance;
    private static volatile boolean active;
    private static volatile String snapshot="{\"active\":false}";
    private final Context app;private final Handler handler=new Handler(Looper.getMainLooper());
    private final CastContext context;
    private CastSession session;private RemoteMediaClient remote;private CastFileServer server;
    private JSONObject pending,book;private String token="",error="";private InetAddress address;
    private long position,duration,lastPersist;private boolean playing,preparing;private int generation;
    private final Runnable tick=new Runnable(){public void run(){if(!active)return;update();if(active)handler.postDelayed(this,1000);}};
    private final RemoteMediaClient.Callback mediaCallback=new RemoteMediaClient.Callback(){@Override public void onStatusUpdated(){update();}@Override public void onMetadataUpdated(){update();}};
    static boolean isActive(){return active;}
    static String state(){return snapshot;}
    static void choose(Activity activity,String spec){try{if(instance==null)instance=new CastAudio(activity.getApplicationContext());instance.select(activity,new JSONObject(spec));}catch(Exception|LinkageError e){Toast.makeText(activity,"キャストを開始できません。Google Play開発者サービスとWi-Fi接続を確認してください。",Toast.LENGTH_LONG).show();}}
    static void stopIfActive(){if(instance!=null&&(active||instance.pending!=null))instance.stop();}
    static void control(String command,long value){if(instance!=null)instance.command(command,value);}
    private CastAudio(Context app){this.app=app;context=CastContext.getSharedInstance(app);context.getSessionManager().addSessionManagerListener(new SessionManagerListener<CastSession>(){
        public void onSessionStarting(CastSession s){}
        public void onSessionStarted(CastSession s,String id){start(s);}
        public void onSessionStartFailed(CastSession s,int code){if(pending!=null)fail("機器に接続できませんでした（"+code+"）");}
        public void onSessionEnding(CastSession s){}
        public void onSessionEnded(CastSession s,int code){if(s==session)cleanup();}
        public void onSessionResuming(CastSession s,String id){}
        public void onSessionResumed(CastSession s,boolean suspended){start(s);}
        public void onSessionResumeFailed(CastSession s,int code){if(s==session||pending!=null)fail("キャスト接続を再開できませんでした");}
        public void onSessionSuspended(CastSession s,int reason){if(s==session)fail("キャスト接続が切れました。続きから再開できます。");}
    },CastSession.class);}
    private void select(Activity activity,JSONObject chosen){
        String name=chosen.optString("localName").toLowerCase(Locale.ROOT);
        if(!(name.endsWith(".m4b")||name.endsWith(".m4a"))||!BookStorage.exists(app,chosen.optString("localName"))){Toast.makeText(activity,"保存済みのM4B・M4A音声本を選んでください",Toast.LENGTH_LONG).show();return;}
        if(pending!=null){Toast.makeText(activity,"キャスト先に接続中です。しばらくお待ちください。",Toast.LENGTH_SHORT).show();return;}
        if(active){new AlertDialog.Builder(activity).setTitle("Chromecastで再生中").setMessage(book.optString("title")).setPositiveButton("キャストを停止",(d,w)->stop()).setNegativeButton("閉じる",null).show();return;}
        MediaRouter router=MediaRouter.getInstance(app);MediaRouteSelector selector=context.getMergedSelector();
        ArrayList<MediaRouter.RouteInfo> routes=new ArrayList<>();ArrayAdapter<String> adapter=new ArrayAdapter<>(activity,android.R.layout.simple_list_item_1,new ArrayList<>());
        LinearLayout layout=new LinearLayout(activity);layout.setOrientation(LinearLayout.VERTICAL);TextView hint=new TextView(activity);hint.setText("同じWi-Fiの機器を検索しています。保存済み音声を1倍速で送信します。");hint.setPadding(24,16,24,16);layout.addView(hint);ListView list=new ListView(activity);list.setAdapter(adapter);layout.addView(list,new LinearLayout.LayoutParams(-1,450));
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("キャスト先を選択").setView(layout).setNegativeButton("キャンセル",null).create();
        Runnable refresh=()->{routes.clear();adapter.clear();for(MediaRouter.RouteInfo r:router.getRoutes())if(r.isEnabled()&&!r.isDefault()&&!r.isBluetooth()&&r.matchesSelector(selector)){routes.add(r);adapter.add(r.getName());}adapter.notifyDataSetChanged();};
        MediaRouter.Callback callback=new MediaRouter.Callback(){@Override public void onRouteAdded(MediaRouter r,MediaRouter.RouteInfo info){refresh.run();}@Override public void onRouteChanged(MediaRouter r,MediaRouter.RouteInfo info){refresh.run();}@Override public void onRouteRemoved(MediaRouter r,MediaRouter.RouteInfo info){refresh.run();}};
        dialog.setOnDismissListener(d->router.removeCallback(callback));
        list.setOnItemClickListener((parent,view,i,id)->{pending=chosen;int attempt=++generation;MediaRouter.RouteInfo route=routes.get(i);boolean selected=route.isSelected();dialog.dismiss();router.selectRoute(route);CastSession current=context.getSessionManager().getCurrentCastSession();if(selected&&current!=null&&current.isConnected())start(current);handler.postDelayed(()->{if(pending!=null&&generation==attempt)fail("キャスト先への接続がタイムアウトしました");},25000);});
        dialog.show();router.addCallback(selector,callback,MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);refresh.run();
    }
    private InetAddress lan(){ConnectivityManager cm=(ConnectivityManager)app.getSystemService(Context.CONNECTIVITY_SERVICE);if(cm==null)return null;for(Network n:cm.getAllNetworks()){NetworkCapabilities c=cm.getNetworkCapabilities(n);if(c==null||c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)||!(c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)))continue;LinkProperties props=cm.getLinkProperties(n);if(props!=null)for(LinkAddress a:props.getLinkAddresses())if(a.getAddress() instanceof Inet4Address&&!a.getAddress().isLoopbackAddress())return a.getAddress();}return null;}
    private void start(CastSession s){
        if(pending==null)return;JSONObject next=pending;pending=null;
        try{
            address=lan();if(address==null)throw new Exception();
            server=new CastFileServer(address,BookStorage.resolve(app,next.optString("localName")));book=next;session=s;remote=s.getRemoteMediaClient();if(remote==null)throw new Exception();
            token="cast-"+UUID.randomUUID();position=Math.max(0,next.optLong("position"));duration=Math.max(0,next.optLong("duration"));error="";playing=false;preparing=true;active=true;int attempt=++generation;
            app.startService(new Intent(app,MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION_CONTROL).putExtra("command","stop"));
            app.startForegroundService(new Intent(app,CastRelayService.class));
            remote.registerCallback(mediaCallback);
            MediaMetadata metadata=new MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK);metadata.putString(MediaMetadata.KEY_TITLE,book.optString("title","音声本"));metadata.putString(MediaMetadata.KEY_ARTIST,"DSBooks");
            MediaInfo info=new MediaInfo.Builder(server.url()).setContentType("audio/mp4").setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setMetadata(metadata).build();
            remote.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).setCurrentTime(position).build()).setResultCallback(r->{if(active&&generation==attempt&&!r.getStatus().isSuccess())fail("キャスト先でこの音声を開けませんでした。機器の対応形式・Wi-Fiを確認してください。");});
            emit();handler.removeCallbacks(tick);handler.post(tick);handler.postDelayed(()->{if(active&&generation==attempt&&preparing)fail("音声を読み込めませんでした。機器の対応形式・Wi-Fiを確認してください。");},45000);
        }catch(Exception|LinkageError e){fail("キャストを開始できませんでした。同じWi-Fiと保存ファイルを確認してください。");}
    }
    private void update(){if(!active||remote==null)return;try{
        InetAddress current=lan();if(current==null||!current.equals(address)){fail("Wi-Fi接続が変わったためキャストを停止しました。");return;}
        MediaInfo info=remote.getMediaInfo();if(info==null||!server.url().equals(info.getContentId())){if(!preparing)cleanup();return;}
        MediaStatus status=remote.getMediaStatus();if(status!=null&&status.getPlayerState()==MediaStatus.PLAYER_STATE_IDLE){if(status.getIdleReason()==MediaStatus.IDLE_REASON_ERROR){fail("キャスト先で再生エラーが発生しました。この音声の対応形式を確認してください。");return;}if(status.getIdleReason()==MediaStatus.IDLE_REASON_FINISHED){duration=Math.max(duration,remote.getStreamDuration());position=duration;stop();return;}}
        preparing=remote.isBuffering()||remote.isLoadingNextItem();playing=remote.isPlaying();position=Math.max(0,remote.getApproximateStreamPosition());duration=Math.max(0,remote.getStreamDuration());persist(false);emit();
    }catch(Exception e){fail("キャスト接続を確認できませんでした");}}
    private void command(String command,long value){if(!active||remote==null)return;try{if(command.equals("stop")){stop();return;}if(command.equals("pause"))remote.pause();else if(command.equals("play")||command.equals("resume"))remote.play();else if(command.equals("seek")||command.equals("back")||command.equals("forward")){long p=command.equals("back")?position-15000:command.equals("forward")?position+15000:value;p=Math.max(0,duration>0?Math.min(duration,p):p);remote.seek(p);}else if(command.equals("speed"))Toast.makeText(app,"キャスト中は1倍速です",Toast.LENGTH_SHORT).show();else if(command.equals("sleep"))Toast.makeText(app,"キャスト中のスリープは未対応です",Toast.LENGTH_SHORT).show();}catch(Exception e){fail("キャストを操作できませんでした");}}
    private void persist(boolean force){if(book==null||duration<=0)return;if(force||!playing||System.currentTimeMillis()-lastPersist>5000){CarLibrary.savePosition(app,book.optString("localName"),position,duration,1);lastPersist=System.currentTimeMillis();}}
    private void stop(){pending=null;persist(true);try{context.getSessionManager().endCurrentSession(true);}catch(Exception ignored){}cleanup();}
    private void fail(String message){error=message;Toast.makeText(app,message,Toast.LENGTH_LONG).show();emit();stop();}
    private void cleanup(){persist(true);generation++;pending=null;handler.removeCallbacks(tick);if(remote!=null)try{remote.unregisterCallback(mediaCallback);}catch(Exception ignored){}remote=null;session=null;if(server!=null){server.close();server=null;}active=false;playing=false;preparing=false;emit();app.stopService(new Intent(app,CastRelayService.class));}
    private void emit(){JSONObject o=new JSONObject();try{o.put("active",active).put("casting",true).put("kind","audio").put("token",token).put("playing",playing).put("preparing",preparing).put("position",position).put("duration",duration).put("speed",1).put("status",preparing?"キャスト先へ接続中…":"Chromecast").put("subtitle","Chromecast");if(book!=null)o.put("sourceId",book.optString("id")).put("localName",book.optString("localName")).put("title",book.optString("title"));if(!error.isEmpty())o.put("error",error);}catch(Exception ignored){}snapshot=o.toString();app.sendBroadcast(new Intent(MediaPlaybackService.ACTION_EVENT).setPackage(app.getPackageName()).putExtra("state",snapshot).putExtra("cast",true));CastRelayService.refreshIfAlive();}
}
