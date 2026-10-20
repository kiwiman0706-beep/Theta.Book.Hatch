package jp.shinwakai.dsbooks.preview;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.Consumer;

/** User-selected document import/export. Never requests broad storage access. */
final class DocumentExchange {
    private static final int IMPORT=8201, DATA=8202, EXPORT=8203;
    private final Activity owner;
    private final Consumer<String> callback;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String pendingExport;
    private boolean busy;
    DocumentExchange(Activity owner, Consumer<String> callback){this.owner=owner;this.callback=callback;}
    void choose(boolean data){
        if(busy){error("ファイル操作が完了してからお試しください");return;}
        try { Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            if(!data)i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
            busy=true;owner.startActivityForResult(i,data?DATA:IMPORT);
        }catch(Exception e){busy=false;error("ファイル選択を開けませんでした");}
    }
    /** "Open with" (ACTION_VIEW): import that one file and ask the page to open it. */
    void importView(Uri uri){
        new Thread(()->{
            try{JSONArray books=new JSONArray(),errors=new JSONArray();
                try{books.put(importBook(uri));}catch(Exception e){errors.put(e.getMessage()==null?"取り込み失敗":e.getMessage());}
                emit(new JSONObject().put("kind","books").put("books",books).put("errors",errors).put("open",true));
            }catch(Exception e){error("ファイルを開けませんでした");}
        },"DSBooks-open-file").start();
    }
    void exportText(String text,String name){
        if(busy){error("ファイル操作が完了してからお試しください");return;}
        if(text==null||text.length()>8*1024*1024){error("テキストが大きすぎます");return;}
        try { pendingExport=text;busy=true;owner.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain").putExtra(Intent.EXTRA_TITLE,name),EXPORT); }
        catch(Exception e){busy=false;pendingExport=null;error("保存画面を開けませんでした");}
    }
    void export(String text){
        if(busy){error("ファイル操作が完了してからお試しください");return;}
        if(text==null||text.length()>8*1024*1024){error("書き出すデータが大きすぎます");return;}
        try{new JSONObject(text);pendingExport=text;busy=true;
            owner.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json").putExtra(Intent.EXTRA_TITLE,"DSBooks-reading-"+System.currentTimeMillis()+".json"),EXPORT);
        }catch(Exception e){busy=false;pendingExport=null;error("データを書き出せませんでした");}
    }
    boolean result(int code,int result,Intent data){
        if(code!=IMPORT&&code!=DATA&&code!=EXPORT)return false;
        if(result!=Activity.RESULT_OK||data==null){busy=false;pendingExport=null;return true;}
        final String exporting=pendingExport;pendingExport=null;
        new Thread(()->{
            try {
                if(code==EXPORT){try(OutputStream out=owner.getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IOException();out.write(exporting.getBytes(StandardCharsets.UTF_8));}emit(new JSONObject().put("kind","exported"));}
                else if(code==DATA){try(InputStream in=owner.getContentResolver().openInputStream(data.getData())){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>8*1024*1024)throw new IOException("JSONは8MB以下にしてください");}emit(new JSONObject().put("kind","data").put("document",new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8))));}}
                else {JSONArray books=new JSONArray(),errors=new JSONArray();List<Uri> uris=new ArrayList<>();if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());}else if(data.getData()!=null)uris.add(data.getData());
                    for(Uri uri:uris){try{books.put(importBook(uri));}catch(Exception e){errors.put(e.getMessage()==null?"取り込み失敗":e.getMessage());}}
                    emit(new JSONObject().put("kind","books").put("books",books).put("errors",errors));
                }
            }catch(Exception e){error(e.getMessage()==null?"ファイル操作に失敗しました":e.getMessage());}
            finally{handler.post(()->busy=false);}
        },"DSBooks-document-exchange").start();return true;
    }
    private JSONObject importBook(Uri uri)throws Exception{
        String name="";long size=-1;
        try(Cursor c=owner.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){if(c!=null&&c.moveToFirst()){name=c.getString(0);if(!c.isNull(1))size=c.getLong(1);}}
        String ext=name.contains(".")?name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT):"";
        if(!Arrays.asList("pdf","epub","md","m4a","m4b","cbz","cbr","jisui").contains(ext))throw new IOException(name+"：対応形式ではありません");
        String storageId=BookStorage.selected(owner);File root=BookStorage.directory(owner,storageId,true);if(size>root.getUsableSpace()-8*1024*1024)throw new IOException("保存容量が足りません");
        File tmp=File.createTempFile("import-",".part",root);
        try{MessageDigest md=MessageDigest.getInstance("SHA-256");long total=0;
            try(InputStream in=owner.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(tmp)){if(in==null)throw new IOException();byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(root.getUsableSpace()<8*1024*1024)throw new IOException("保存容量が足りません");out.write(b,0,n);md.update(b,0,n);total+=n;}}
            if(total==0||(size>=0&&total!=size))throw new IOException("ファイルの読み込みが完了しませんでした");
            StringBuilder hash=new StringBuilder();for(byte x:md.digest())hash.append(String.format(Locale.ROOT,"%02x",x&255));
            String local="import-"+hash+"."+ext;File target=new File(root,local);if(!target.isFile()&&!tmp.renameTo(target))throw new IOException("ファイルを保存できませんでした");
            return new JSONObject().put("id","local:"+hash+":"+ext).put("bookId","sha256:"+hash).put("localName",BookLocation.encode(storageId,local)).put("title",name.substring(0,name.lastIndexOf('.'))).put("importName",name).put("fileExt",ext.toUpperCase(Locale.ROOT)).put("size",total).put("type",ext.equals("pdf")?"PDF":ext.equals("epub")?"ePub":ext.equals("md")?"Markdown":ext.equals("jisui")?"Jisui":ext.equals("cbz")||ext.equals("cbr")?"Comic":"Audio").put("offline",true).put("folder","端末から取り込み").put("author","").put("cover","c5").put("progress",0);
        }finally{tmp.delete();}
    }
    private void emit(JSONObject o){handler.post(()->callback.accept(o.toString()));}
    private void error(String message){try{emit(new JSONObject().put("error",message));}catch(Exception ignored){}}
}
