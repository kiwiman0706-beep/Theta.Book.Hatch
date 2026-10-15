package jp.shinwakai.dsbooks.preview;
import android.content.*;
import android.os.*;
import android.os.storage.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Only app-specific storage roots returned by Android can be selected.
 * No broad storage permission; no silent fallback if a selected SD card is absent.
 */
final class BookStorage {
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("book_storage",Context.MODE_PRIVATE);}
    static String selected(Context c){return prefs(c).getString("selected",BookLocation.INTERNAL);}
    private static String id(File f)throws Exception{
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(f.getCanonicalPath().getBytes(StandardCharsets.UTF_8));
        StringBuilder s=new StringBuilder("vol-");for(int i=0;i<12;i++)s.append(String.format(Locale.ROOT,"%02x",hash[i]&255));return s.toString();
    }
    private static JSONObject roots(Context c){try{return new JSONObject(prefs(c).getString("roots","{}"));}catch(Exception e){return new JSONObject();}}
    static synchronized JSONArray locations(Context c)throws Exception{
        JSONObject all=roots(c);File[] dirs=c.getExternalFilesDirs(null);
        StorageManager manager=(StorageManager)c.getSystemService(Context.STORAGE_SERVICE);
        for(File dir:dirs){if(dir==null)continue;try{
            File root=new File(dir,"books").getCanonicalFile();String key=id(root);
            StorageVolume v=manager.getStorageVolume(dir);boolean removable=Environment.isExternalStorageRemovable(dir);
            String label=removable?(v==null?"SDカード／外部ストレージ":v.getDescription(c))+"（外部・専用フォルダ）":"本体（共有ストレージ・専用フォルダ）";
            all.put(key,new JSONObject().put("path",root.getPath()).put("label",label).put("removable",removable));
        }catch(Exception ignored){}}
        prefs(c).edit().putString("roots",all.toString()).commit();
        JSONArray result=new JSONArray();File internal=new File(c.getFilesDir(),"books");internal.mkdirs();
        result.put(item(BookLocation.INTERNAL,internal,"本体（アプリ内・標準）",true,false));
        Iterator<String> keys=all.keys();while(keys.hasNext()){String key=keys.next();JSONObject value=all.getJSONObject(key);File file=new File(value.getString("path"));
            boolean available=Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(file));
            result.put(item(key,file,value.getString("label"),available,value.optBoolean("removable")));
        }
        return result;
    }
    private static JSONObject item(String id,File file,String label,boolean available,boolean removable)throws Exception{
        File space=file.exists()?file:file.getParentFile();return new JSONObject().put("id",id).put("label",label).put("available",available).put("removable",removable)
            .put("path",file.getPath()).put("usable",available?space.getUsableSpace():0).put("total",available?space.getTotalSpace():0);
    }
    static File directory(Context c,String key,boolean write)throws IOException{
        if(key==null||key.isEmpty())key=selected(c);
        File root;
        if(BookLocation.INTERNAL.equals(key))root=new File(c.getFilesDir(),"books");
        else{
            JSONObject value=roots(c).optJSONObject(key);
            if(value==null)try{locations(c);value=roots(c).optJSONObject(key);}catch(Exception ignored){}
            if(value==null)throw new IOException("保存先が見つかりません。設定から選び直してください。");
            root=new File(value.optString("path"));String state=Environment.getExternalStorageState(root);
            if(!Environment.MEDIA_MOUNTED.equals(state)&&!( !write&&Environment.MEDIA_MOUNTED_READ_ONLY.equals(state)))
                throw new IOException("保存先のSDカード／外部ストレージを利用できません。挿入・接続を確認してください。");
        }
        root=root.getCanonicalFile();
        if(write&&(!root.isDirectory()&&!root.mkdirs()||!root.canWrite()))throw new IOException("保存先に書き込めません。設定から保存先を確認してください。");
        return root;
    }
    static File resolve(Context c,String token)throws IOException{
        String[] parts=BookLocation.decode(token);return BookLocation.child(directory(c,parts[0],false),parts[1]);
    }
    static boolean exists(Context c,String token){try{return resolve(c,token).isFile();}catch(Exception e){return false;}}
    static boolean delete(Context c,String token){try{return resolve(c,token).delete();}catch(Exception e){return false;}}
    static synchronized void select(Context c,String key)throws Exception{
        JSONArray options=locations(c);boolean allowed=false;for(int i=0;i<options.length();i++){JSONObject o=options.getJSONObject(i);if(key.equals(o.getString("id"))&&o.getBoolean("available"))allowed=true;}
        if(!allowed)throw new IOException("この保存先は利用できません。SDカードの接続を確認してください。");
        File root=directory(c,key,true);File probe=File.createTempFile(".dsbooks-check-",".tmp",root);
        try(FileOutputStream out=new FileOutputStream(probe)){out.write(1);out.getFD().sync();}finally{probe.delete();}
        if(!prefs(c).edit().putString("selected",key).commit())throw new IOException("保存先の設定を記録できませんでした。");
    }
    static JSONObject info(Context c){JSONObject out=new JSONObject();try{
        JSONArray options=locations(c);String choice=selected(c);out.put("selected",choice).put("locations",options);
        for(int i=0;i<options.length();i++){JSONObject o=options.getJSONObject(i);if(choice.equals(o.getString("id")))out.put("label",o.getString("label")).put("available",o.getBoolean("available")).put("usable",o.getLong("usable")).put("total",o.getLong("total")).put("removable",o.optBoolean("removable"));}
        if(!out.has("available"))out.put("available",false).put("usable",0).put("label","未接続の保存先");
    }catch(Exception e){try{out.put("available",false).put("usable",0);}catch(Exception ignored){}}return out;}
}
