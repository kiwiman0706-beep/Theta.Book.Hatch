package jp.shinwakai.dsbooks.preview;

import android.content.Context;
import org.json.*;

/** Private, credential-free index for the car browser. Only saved audio is published. */
final class CarLibrary {
 static final String PREFS="car_library";
 static void publish(Context c,String json){
  try{JSONArray source=new JSONArray(json),safe=new JSONArray();
   for(int i=0;i<source.length()&&safe.length()<5000;i++){
    JSONObject b=source.optJSONObject(i);if(b==null||!"Audio".equals(b.optString("type"))||!b.optBoolean("offline")||b.optString("localName").isEmpty())continue;
    JSONObject o=new JSONObject();for(String k:new String[]{"id","title","folder","localName","path","modifiedAt","audioPosition","audioDuration","audioSpeed","progressUpdatedAt"})if(b.has(k))o.put(k,b.get(k));o.put("title",b.optString("title").substring(0,Math.min(300,b.optString("title").length())));o.put("folder",b.optString("folder").substring(0,Math.min(300,b.optString("folder").length())));safe.put(o);
   }
   android.content.SharedPreferences p=c.getSharedPreferences(PREFS,0);String next=safe.toString();if(!next.equals(p.getString("books","[]")))p.edit().putString("books",next).apply();
  }catch(Exception ignored){}
 }
 static JSONArray books(Context c){try{return new JSONArray(c.getSharedPreferences(PREFS,0).getString("books","[]"));}catch(Exception e){return new JSONArray();}}
 static JSONObject find(Context c,String id){JSONArray a=books(c);for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&id.equals(b.optString("id")))return b;}return null;}
 static JSONObject positions(Context c){try{return new JSONObject(c.getSharedPreferences(PREFS,0).getString("positions","{}"));}catch(Exception e){return new JSONObject();}}
 static synchronized void savePosition(Context c,String local,long position,long duration,float speed){
  if(local.isEmpty()||duration<=0)return;
  try{JSONObject all=positions(c);all.put(local,new JSONObject().put("position",position).put("duration",duration).put("speed",speed).put("updatedAt",System.currentTimeMillis()));c.getSharedPreferences(PREFS,0).edit().putString("positions",all.toString()).apply();}catch(Exception ignored){}
 }
 static long resume(Context c,JSONObject b){JSONObject p=positions(c).optJSONObject(b.optString("localName"));return p!=null&&p.optLong("updatedAt")>b.optLong("progressUpdatedAt")?p.optLong("position"):b.optLong("audioPosition");}
}
