package jp.shinwakai.dsbooks.preview;
import android.os.*;
import android.content.*;
import org.json.*;
/** Exported browse endpoint; playback commands remain on the authenticated session. */
public final class CarBrowserService extends androidx.media.MediaBrowserServiceCompat {
 private final java.util.concurrent.ExecutorService browserWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
 private boolean bound;
 private final ServiceConnection connection=new ServiceConnection(){
  public void onServiceConnected(ComponentName name,IBinder binder){setSessionToken(android.support.v4.media.session.MediaSessionCompat.Token.fromToken(((MediaPlaybackService.LocalBinder)binder).token()));}
  public void onServiceDisconnected(ComponentName name){}
 };
 @Override public void onCreate(){super.onCreate();bound=bindService(new Intent(this,MediaPlaybackService.class),connection,BIND_AUTO_CREATE);}
    @Override public BrowserRoot onGetRoot(String pkg,int uid,Bundle hints){
        String[] packages=getPackageManager().getPackagesForUid(uid);boolean matched=false;
        if(packages!=null)for(String p:packages)if(p.equals(pkg))matched=true;
        if(!matched)return null;
        boolean trusted=uid==android.os.Process.myUid()||"com.google.android.projection.gearhead".equals(pkg)||"com.google.android.googlequicksearchbox".equals(pkg);
        if(!trusted)return null;
        Bundle extras=new Bundle();extras.putBoolean("android.media.browse.CONTENT_STYLE_SUPPORTED",true);
        return new BrowserRoot("saved-audio",extras);
    }
    @Override public void onLoadChildren(String parent,Result<java.util.List<android.support.v4.media.MediaBrowserCompat.MediaItem>> result){
        int start=0;try{if(parent.startsWith("saved-audio:"))start=Integer.parseInt(parent.substring(12));else if(!"saved-audio".equals(parent))throw new IllegalArgumentException();if(start<0||start>5000)throw new IllegalArgumentException();}catch(Exception e){result.sendResult(java.util.Collections.emptyList());return;}
        final int offset=start;
        result.detach();browserWorker.execute(()->{
            java.util.List<android.support.v4.media.MediaBrowserCompat.MediaItem> out=new java.util.ArrayList<>();
            JSONArray items=CarLibrary.books(this);
            for(int i=offset;i<Math.min(items.length(),offset+100);i++)try{JSONObject b=items.getJSONObject(i);if(!BookStorage.exists(this,b.optString("localName")))continue;
                android.support.v4.media.MediaDescriptionCompat.Builder d=new android.support.v4.media.MediaDescriptionCompat.Builder().setMediaId(b.optString("id")).setTitle(b.optString("title")).setSubtitle(b.optString("folder")+" · 保存済み");
                // Keep binder parcels small; covers are shown for the current item by MediaSession.
                out.add(new android.support.v4.media.MediaBrowserCompat.MediaItem(d.build(),android.support.v4.media.MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
            }catch(Exception ignored){}
            if(items.length()>offset+100){android.support.v4.media.MediaDescriptionCompat d=new android.support.v4.media.MediaDescriptionCompat.Builder().setMediaId("saved-audio:"+(offset+100)).setTitle("次の100冊").build();out.add(new android.support.v4.media.MediaBrowserCompat.MediaItem(d,android.support.v4.media.MediaBrowserCompat.MediaItem.FLAG_BROWSABLE));}
            result.sendResult(out);
        });
    }

 @Override public void onDestroy(){if(bound)unbindService(connection);browserWorker.shutdown();super.onDestroy();}
}
