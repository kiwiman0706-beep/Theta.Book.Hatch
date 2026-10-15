package jp.shinwakai.dsbooks.preview;
import android.app.*;
import android.content.*;
import android.os.*;
import android.media.*;
import android.media.session.*;
import org.json.JSONObject;
/** Keeps local HTTP source alive and routes OS playback controls to the receiver. */
public final class CastRelayService extends Service {
    private static CastRelayService instance;private MediaSession session;private PowerManager.WakeLock wake;
    private static final String CHANNEL="dsbooks_cast_audio";private static final int ID=4308;
    static void refreshIfAlive(){if(instance!=null)instance.refresh();}
    @Override public void onCreate(){super.onCreate();instance=this;NotificationChannel c=new NotificationChannel(CHANNEL,"DSBooks キャスト",NotificationManager.IMPORTANCE_LOW);getSystemService(NotificationManager.class).createNotificationChannel(c);
        PowerManager pm=getSystemService(PowerManager.class);wake=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"DSBooks:Cast");wake.acquire();
        session=new MediaSession(this,"DSBooks Cast");session.setCallback(new MediaSession.Callback(){public void onPlay(){CastAudio.control("play",0);}public void onPause(){CastAudio.control("pause",0);}public void onStop(){CastAudio.control("stop",0);}public void onSeekTo(long p){CastAudio.control("seek",p);}public void onFastForward(){CastAudio.control("forward",0);}public void onRewind(){CastAudio.control("back",0);}public void onSkipToNext(){onFastForward();}public void onSkipToPrevious(){onRewind();}});session.setActive(true);startForeground(ID,notification());refresh();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){if(intent!=null&&intent.hasExtra("command"))CastAudio.control(intent.getStringExtra("command"),0);if(!CastAudio.isActive())stopSelf();else refresh();return START_NOT_STICKY;}
    private JSONObject state(){try{return new JSONObject(CastAudio.state());}catch(Exception e){return new JSONObject();}}
    private Notification.Action action(int icon,String label,String command){Intent i=new Intent(this,CastRelayService.class).putExtra("command",command);return new Notification.Action.Builder(icon,label,PendingIntent.getService(this,command.hashCode(),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE)).build();}
    private Notification notification(){JSONObject s=state();PendingIntent open=PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);boolean playing=s.optBoolean("playing");return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(s.optString("title","DSBooks")).setContentText("Chromecast · "+(s.optBoolean("preparing")?"接続中":playing?"再生中":"一時停止中")).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC).addAction(action(android.R.drawable.ic_media_rew,"15秒戻す","back")).addAction(action(playing?android.R.drawable.ic_media_pause:android.R.drawable.ic_media_play,playing?"一時停止":"再生",playing?"pause":"play")).addAction(action(android.R.drawable.ic_media_ff,"15秒進める","forward")).addAction(action(android.R.drawable.ic_menu_close_clear_cancel,"停止","stop")).setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();}
    private void refresh(){if(session==null)return;JSONObject s=state();session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,s.optString("title","DSBooks")).putString(MediaMetadata.METADATA_KEY_ARTIST,"Chromecast").putLong(MediaMetadata.METADATA_KEY_DURATION,s.optLong("duration")).build());long actions=PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_STOP|PlaybackState.ACTION_SEEK_TO|PlaybackState.ACTION_FAST_FORWARD|PlaybackState.ACTION_REWIND|PlaybackState.ACTION_SKIP_TO_NEXT|PlaybackState.ACTION_SKIP_TO_PREVIOUS;session.setPlaybackState(new PlaybackState.Builder().setActions(actions).setState(!s.optBoolean("active")?PlaybackState.STATE_STOPPED:s.optBoolean("preparing")?PlaybackState.STATE_BUFFERING:s.optBoolean("playing")?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED,s.optLong("position"),1).build());getSystemService(NotificationManager.class).notify(ID,notification());}
    @Override public IBinder onBind(Intent i){return null;}
    @Override public void onDestroy(){instance=null;CastAudio.stopIfActive();if(session!=null){session.setActive(false);session.release();session=null;}if(wake!=null&&wake.isHeld())wake.release();stopForeground(true);super.onDestroy();}
}
