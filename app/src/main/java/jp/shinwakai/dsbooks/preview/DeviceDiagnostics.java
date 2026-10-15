package jp.shinwakai.dsbooks.preview;

import android.app.*;
import android.content.*;
import android.content.pm.PackageInfo;
import android.graphics.pdf.PdfRenderer;
import android.media.*;
import android.os.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.util.zip.ZipFile;

/** Bounded read-only probes. No content, paths, account or network identifiers leave this class. */
final class DeviceDiagnostics {
    static JSONObject run(Context c, String request, java.util.function.BooleanSupplier cancelled, java.util.function.Consumer<JSONObject> progress, FileExercise.ChapterProbe chapter) {
        JSONObject out=new JSONObject(); JSONArray checks=new JSONArray(), files=new JSONArray();
        try {
            out.put("playbackEngine","LibVLC 3.7.1");
            JSONObject lastAudio = new JSONObject(c.getSharedPreferences("audio_diagnostic",Context.MODE_PRIVATE).getString("report","{}"));
            if ("nas-stream".equals(lastAudio.optString("source"))) out.put("lastStreamingPlayback",lastAudio);
            out.put("sdk",Build.VERSION.SDK_INT).put("android",Build.VERSION.RELEASE);
            PackageInfo app=c.getPackageManager().getPackageInfo(c.getPackageName(),0);
            out.put("appVersion",app.versionName);
            PackageInfo web=WebView.getCurrentWebViewPackage();out.put("webViewVersion",web==null?"unknown":web.versionName);
            out.put("notificationsEnabled",((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled());
            out.put("batteryOptimizationExempt",((PowerManager)c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName()));
            out.put("freeBytes",c.getFilesDir().getUsableSpace());
            JSONObject storage=BookStorage.info(c);
            out.put("downloadStorage",new JSONObject().put("available",storage.optBoolean("available")).put("removable",storage.optBoolean("removable")).put("freeBytes",storage.optLong("usable")));
            File probe=null;
            try { probe=File.createTempFile("selftest-",".tmp",c.getCacheDir());try(FileOutputStream o=new FileOutputStream(probe)){o.write(new byte[]{68,83,66});}try(FileInputStream in=new FileInputStream(probe)){if(in.read()!=68||in.read()!=83||in.read()!=66)throw new IOException();}check(checks,"native-cache-write-read","PASS"); }
            catch(Exception e){check(checks,"native-cache-write-read","FAIL");}finally{if(probe!=null)probe.delete();}
            JSONObject options=request.trim().startsWith("{")?new JSONObject(request):new JSONObject();JSONArray req=options.optJSONArray("files");if(req==null)req=new JSONArray(request);boolean deep=options.optBoolean("deep");int max=Math.min(200,req.length());out.put("requestedFiles",req.length()).put("plannedFiles",max);
            for(int i=0;i<max;i++){
                if(cancelled.getAsBoolean()){out.put("cancelled",true);break;}
                JSONObject q=req.optJSONObject(i);if(q==null)continue;
                JSONObject f=new JSONObject().put("ref","F"+(i+1));files.put(f);
                try {
                    String name=q.optString("localName");if(name.isEmpty()){f.put("parseCheck","NOT_TESTED").put("reason","not-downloaded");continue;}File book=BookStorage.resolve(c,name);
                    if(!book.isFile())throw new IOException();
                    f.put("storage",BookLocation.INTERNAL.equals(BookLocation.decode(name)[0])?"internal":"external");
                    long size=book.length();f.put("bytes",size).put("exists",true);
                    android.content.SharedPreferences diag=c.getSharedPreferences("audio_diagnostic",Context.MODE_PRIVATE);
                    if(name.equals(diag.getString("file",""))) f.put("lastPlayback",new JSONObject(diag.getString("report","{}")));
                    long expected=q.optLong("size",-1);f.put("sizeCheck",expected>0?(expected==size?"PASS":"FAIL"):"NOT_TESTED");
                    String type=q.optString("type");f.put("type",type.matches("PDF|ePub|Audio|Markdown|Comic")?type:"Other");
                    if(type.equals("PDF")){try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(book,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){f.put("pages",pdf.getPageCount());}}
                    else if(type.equals("Comic")){try(ComicArchive archive=new ComicArchive(book)){f.put("pages",archive.count()).put("container",archive.format);}}
                    else if(type.equals("ePub")){try(ZipFile zip=new ZipFile(book)){f.put("zipEntries",zip.size());if(zip.getEntry("META-INF/container.xml")==null)throw new IOException();}}
                    else if(type.equals("Audio")){f.put("supportedChapters",IsoChapterParser.read(book).size()).put("audioParser","Android MediaExtractor (reference)");MediaExtractor ex=new MediaExtractor();try{ex.setDataSource(book.getPath());JSONArray tracks=new JSONArray();boolean found=false;for(int n=0;n<ex.getTrackCount();n++){MediaFormat mf=ex.getTrackFormat(n);String mime=mf.getString(MediaFormat.KEY_MIME);if(mime!=null&&mime.startsWith("audio/")){found=true;JSONObject t=new JSONObject().put("mime",mime);if(mf.containsKey(MediaFormat.KEY_DURATION))t.put("durationMs",mf.getLong(MediaFormat.KEY_DURATION)/1000);if(mf.containsKey(MediaFormat.KEY_SAMPLE_RATE))t.put("sampleRate",mf.getInteger(MediaFormat.KEY_SAMPLE_RATE));if(mf.containsKey(MediaFormat.KEY_CHANNEL_COUNT))t.put("channels",mf.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
                        try{String decoder=new MediaCodecList(MediaCodecList.REGULAR_CODECS).findDecoderForFormat(mf);t.put("decoderAvailable",decoder!=null);if(decoder!=null)t.put("decoder",decoder);}catch(Exception ignored){}
                        tracks.put(t);}}f.put("audioTracks",tracks);if(!found)throw new IOException();f.put("platformAudioParseCheck","PASS");}finally{ex.release();}}
                    else {try(FileInputStream in=new FileInputStream(book)){if(in.read()<0)throw new IOException();}}
                    f.put("parseCheck","PASS");
                }catch(Exception e){f.put("parseCheck","FAIL");f.put("errorClass",e.getClass().getSimpleName());
                    if("Audio".equals(q.optString("type"))) {
                        f.put("platformAudioParseCheck","FAIL");
                        JSONObject runtime=f.optJSONObject("lastPlayback");
                        JSONArray tracks=runtime==null?null:runtime.optJSONArray("vlcAudioTracks");
                        if(tracks!=null&&tracks.length()>0) f.put("parseCheck","PASS").put("parseMethod","LibVLC-runtime");
                    }}
                if(deep){try{File book=BookStorage.resolve(c,q.optString("localName"));if(!book.isFile())throw new IOException();FileExercise.run(c,book,q.optString("type"),f,options.optBoolean("checksum"),options.optBoolean("decode",true),cancelled,chapter);JSONArray tracks=f.optJSONArray("vlcProbeTracks");if(tracks!=null&&tracks.length()>0)f.put("parseCheck","PASS").put("parseMethod","LibVLC-probe");}catch(Exception e){f.put("exerciseError",cancelled.getAsBoolean()?"CANCELLED":e.getClass().getSimpleName());JSONArray ex=f.optJSONArray("exercises");if(ex==null){ex=new JSONArray();f.put("exercises",ex);}check(ex,"FILE-EXERCISE",cancelled.getAsBoolean()?"NOT_TESTED":"FAIL");}}
                out.put("testedFiles",files.length());progress.accept(new JSONObject().put("done",files.length()).put("total",max));
            }
            out.put("testedFiles",files.length()).put("cancelled",cancelled.getAsBoolean());
        }catch(Exception e){try{check(checks,"native-probe","FAIL");}catch(Exception ignored){}}
        try{boolean decoded=false;for(int i=0;i<files.length();i++)if(files.getJSONObject(i).optInt("decodedAudioBuffers")>0)decoded=true;out.put("checks",checks).put("files",files).put("playbackDecoder",decoded?"SAMPLED-SILENT":"NOT_TESTED").put("nasConnection","NOT_TESTED");}catch(Exception ignored){}
        return out;
    }
    private static void check(JSONArray a,String id,String status)throws JSONException {a.put(new JSONObject().put("id",id).put("status",status));}
}
