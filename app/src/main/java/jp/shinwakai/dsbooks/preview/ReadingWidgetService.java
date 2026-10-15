package jp.shinwakai.dsbooks.preview;
import android.widget.*;
import android.content.*;
import android.graphics.*;
import org.json.*;
import java.io.*;
import java.security.*;
import java.nio.charset.StandardCharsets;
public final class ReadingWidgetService extends RemoteViewsService {
 @Override public RemoteViewsFactory onGetViewFactory(Intent i){return new Factory(getApplicationContext(),i.getBooleanExtra("rich",false));}
 static final class Factory implements RemoteViewsFactory {
  final Context c;final boolean rich;JSONArray books=new JSONArray();Factory(Context c,boolean r){this.c=c;rich=r;}
  public void onCreate(){onDataSetChanged();}public void onDestroy(){}public void onDataSetChanged(){try{books=new JSONArray(c.getSharedPreferences(ReadingWidgetProvider.PREFS,0).getString(ReadingWidgetProvider.BOOKS,"[]"));}catch(Exception e){books=new JSONArray();}}
  public int getCount(){return Math.min(200,books.length());}public int getViewTypeCount(){return 1;}public boolean hasStableIds(){return false;}public long getItemId(int p){return p;}public RemoteViews getLoadingView(){return null;}
  public RemoteViews getViewAt(int p){JSONObject b=books.optJSONObject(p);if(b==null)return null;RemoteViews v=new RemoteViews(c.getPackageName(),rich?R.layout.reading_widget_cover_item:R.layout.reading_widget_text_item);int pct=Math.max(0,Math.min(100,b.optInt("progress")));v.setTextViewText(R.id.widget_book_title,b.optString("title"));String type=b.optString("type");v.setTextViewText(R.id.widget_book_detail,("Audio".equals(type)?"♫ ":"")+type+" · "+pct+"%"+(b.optBoolean("offline")?" · 保存済み":""));v.setProgressBar(R.id.widget_book_progress,100,pct,false);
   {Bitmap cover=cover(b);if(cover!=null)v.setImageViewBitmap(R.id.widget_book_cover,cover);else v.setImageViewResource(R.id.widget_book_cover,R.drawable.ic_dsbooks);}
   v.setOnClickFillInIntent(R.id.widget_book_item,new Intent().putExtra("dsbooks.widget.book_id",b.optString("id")));return v;
  }
  Bitmap cover(JSONObject b){try{File dir=new File(c.getFilesDir(),"thumbnails");String local=b.optString("localName");File f=local.isEmpty()?null:new File(dir,hash(local)+".jpg");if(f==null||!f.isFile())f=new File(dir,"remote-"+hash("remote:"+b.optString("path")+"|"+b.optLong("modifiedAt"))+".jpg");if(!f.isFile()||f.length()>1024*1024)return null;BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(f.getPath(),o);o.inSampleSize=1;while(o.outWidth/o.inSampleSize>240||o.outHeight/o.inSampleSize>320)o.inSampleSize*=2;o.inJustDecodeBounds=false;return BitmapFactory.decodeFile(f.getPath(),o);}catch(Exception e){return null;}}
  static String hash(String s)throws Exception{StringBuilder h=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)))h.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return h.toString().substring(0,32);}
 }
}
