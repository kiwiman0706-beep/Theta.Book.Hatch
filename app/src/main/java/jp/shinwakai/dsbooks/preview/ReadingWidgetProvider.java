package jp.shinwakai.dsbooks.preview;
import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.widget.RemoteViews;
/** Scrollable reading list. The rich provider uses the same saved collection. */
public class ReadingWidgetProvider extends AppWidgetProvider {
 static final String PREFS="reading_widget",BOOKS="books";
 private static final Handler handler=new Handler(Looper.getMainLooper());
 private static boolean pending;
 protected boolean rich(){return false;}
 @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids)update(c,m,id,rich());}
 @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle opts){update(c,m,id,rich());}
 public static void publish(Context c,String json){String old=c.getSharedPreferences(PREFS,0).getString(BOOKS,"[]");if(old.equals(json))return;c.getSharedPreferences(PREFS,0).edit().putString(BOOKS,json).apply();refresh(c);}
 public static void refresh(Context context){Context c=context.getApplicationContext();handler.post(()->{if(pending)return;pending=true;handler.postDelayed(()->{pending=false;AppWidgetManager m=AppWidgetManager.getInstance(c);for(Class<?> provider:new Class<?>[]{ReadingWidgetProvider.class,RichReadingWidgetProvider.class})for(int id:m.getAppWidgetIds(new ComponentName(c,provider)))update(c,m,id,provider==RichReadingWidgetProvider.class);},1500);});}
 static void update(Context c,AppWidgetManager m,int id,boolean rich){
  RemoteViews v=new RemoteViews(c.getPackageName(),rich?R.layout.reading_widget_rich:R.layout.reading_widget_list);
  Intent service=new Intent(c,ReadingWidgetService.class).putExtra("rich",rich).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id);service.setData(Uri.parse("dsbooks-widget://"+id+"/"+rich));v.setRemoteAdapter(R.id.widget_collection,service);v.setEmptyView(R.id.widget_collection,R.id.widget_empty);
  Intent open=new Intent(c,MainActivity.class).setAction("jp.shinwakai.dsbooks.preview.RESUME_BOOK").setData(Uri.parse("dsbooks-widget://open/"+id)).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
  PendingIntent template=PendingIntent.getActivity(c,id,open,PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=31?PendingIntent.FLAG_MUTABLE:0));v.setPendingIntentTemplate(R.id.widget_collection,template);
  v.setOnClickPendingIntent(R.id.widget_heading,PendingIntent.getActivity(c,id+100000,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  m.updateAppWidget(id,v);m.notifyAppWidgetViewDataChanged(id,R.id.widget_collection);
 }
}
