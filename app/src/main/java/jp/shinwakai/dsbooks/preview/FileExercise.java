package jp.shinwakai.dsbooks.preview;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.net.Uri;
import org.json.*;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.interfaces.IMedia;
import java.io.*;
import java.security.*;
import java.util.*;
import java.util.function.BooleanSupplier;
/** Independent read-only exercises; never modifies reader progress or starts a media session. */
final class FileExercise {
 interface ChapterProbe {JSONObject read(File f,int index)throws Exception;}
 static void check(JSONArray a,String id,String status)throws Exception{a.put(new JSONObject().put("id",id).put("status",status));}
 static int[] samples(int count){return count<=1?new int[]{0}:count==2?new int[]{0,1}:new int[]{0,count/2,count-1};}
 static void run(Context c,File f,String type,JSONObject out,boolean hash,boolean decode,BooleanSupplier cancelled,ChapterProbe chapter)throws Exception{
  JSONArray checks=new JSONArray();out.put("exercises",checks);
  if(type.equals("ePub")){
   EpubInspection.Result r=EpubInspection.inspect(f,cancelled);out.put("spineCount",r.spine).put("checkedDocuments",r.checked).put("missingResources",r.missing);check(checks,"EPUB-PACKAGE","PASS");check(checks,"EPUB-SPINE",r.partial?"PARTIAL":r.missing>0?"FAIL":"PASS");check(checks,"EPUB-RESOURCES",r.missing>0?"FAIL":r.partial?"PARTIAL":"PASS");
   int rendered=0;for(int i:samples(r.spine)){if(cancelled.getAsBoolean())throw new InterruptedIOException();JSONObject result=chapter.read(f,i);String html=result.optString("html");if(!html.isEmpty()&&(!html.replaceAll("(?s)<[^>]*>","").trim().isEmpty()||html.contains("<img")))rendered++;}out.put("readerSamples",rendered);check(checks,"EPUB-READER-EXTRACTION",rendered==samples(r.spine).length?"PASS":"FAIL");
  }else if(type.equals("Comic")){
   try(ComicArchive archive=new ComicArchive(f)){int done=0;for(int i:samples(archive.count())){if(cancelled.getAsBoolean())throw new InterruptedIOException();byte[] bytes=archive.page(i);android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();opts.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);if(opts.outWidth<=0||opts.outHeight<=0)throw new IOException("INVALID_IMAGE");done++;}out.put("pages",archive.count()).put("imageSamples",done);check(checks,"COMIC-IMAGE-SAMPLE","PASS");}
  }else if(type.equals("PDF")){
   try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){int n=pdf.getPageCount();if(n<1)throw new IOException();int done=0;for(int i:samples(n)){if(cancelled.getAsBoolean())throw new InterruptedIOException();try(PdfRenderer.Page page=pdf.openPage(i)){Bitmap bitmap=Bitmap.createBitmap(360,480,Bitmap.Config.ARGB_8888);try{bitmap.eraseColor(Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);done++;}finally{bitmap.recycle();}}}out.put("renderedPageSamples",done).put("pages",n);check(checks,"PDF-RENDER-SAMPLE","PASS");}
  }else if(type.equals("Audio"))audio(c,f,out,checks,decode,cancelled);
  else if(type.equals("Markdown")){byte[] b;try(InputStream in=new FileInputStream(f)){b=new byte[(int)Math.min(f.length(),1024*1024)];int at=0,n;while(at<b.length&&(n=in.read(b,at,b.length-at))>0)at+=n;java.nio.charset.CoderResult result=java.nio.charset.StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(b,0,at),java.nio.CharBuffer.allocate(at+1),f.length()<=b.length);if(result.isError())result.throwException();}check(checks,"MARKDOWN-UTF8-SAMPLE",f.length()>1024*1024?"PARTIAL":"PASS");}
  if(hash){MessageDigest digest=MessageDigest.getInstance("SHA-256");long bytes=0;try(InputStream in=new FileInputStream(f)){byte[] b=new byte[128*1024];int n;while((n=in.read(b))!=-1){if(cancelled.getAsBoolean())throw new InterruptedIOException();digest.update(b,0,n);bytes+=n;}}StringBuilder s=new StringBuilder();for(byte b:digest.digest())s.append(String.format(Locale.ROOT,"%02x",b&255));out.put("sha256",s.toString()).put("hashedBytes",bytes);check(checks,"FILE-FULL-READ",bytes==f.length()?"PASS":"FAIL");}else check(checks,"FILE-FULL-READ","NOT_TESTED");
 }
 static void audio(Context c,File f,JSONObject out,JSONArray checks,boolean decode,BooleanSupplier cancelled)throws Exception{
  LibVLC lib=null;Media media=null;MediaPlayer player=null;
  try{lib=new LibVLC(c, new ArrayList<>(Arrays.asList("--no-video","--aout=dummy","--stats","--no-osd")));media=new Media(lib,Uri.fromFile(f));media.parseAsync(IMedia.Parse.ParseLocal,4000);long deadline=System.currentTimeMillis()+5000;while(!media.isParsed()&&System.currentTimeMillis()<deadline&&!cancelled.getAsBoolean())Thread.sleep(50);
   JSONArray tracks=new JSONArray();for(int i=0;i<media.getTrackCount();i++){IMedia.Track t=media.getTrack(i);if(t instanceof IMedia.AudioTrack){IMedia.AudioTrack a=(IMedia.AudioTrack)t;tracks.put(new JSONObject().put("codec",a.codec).put("channels",a.channels).put("sampleRate",a.rate));}}
   out.put("vlcProbeTracks",tracks).put("durationMs",media.getDuration());check(checks,"AUDIO-VLC-PARSE",tracks.length()>0?"PASS":"FAIL");
   if(!decode){check(checks,"AUDIO-DECODE-SAMPLE","NOT_TESTED");return;}if(cancelled.getAsBoolean())throw new InterruptedIOException();player=new MediaPlayer(lib);player.setMedia(media);player.setVolume(0);player.play();long until=System.currentTimeMillis()+7000;int decoded=0;while(System.currentTimeMillis()<until&&!cancelled.getAsBoolean()){IMedia.Stats stats=media.getStats();if(stats!=null)decoded=stats.decodedAudio;if(decoded>0&&player.getTime()>300)break;Thread.sleep(100);}check(checks,"AUDIO-DECODE-SAMPLE",decoded>0?"PASS":"FAIL");out.put("decodedAudioBuffers",decoded);
   if(decoded>0&&player.isSeekable()&&player.getLength()>5000&&!cancelled.getAsBoolean()){long target=player.getLength()/2;player.setTime(target,false);until=System.currentTimeMillis()+4000;boolean reached=false;while(System.currentTimeMillis()<until&&!cancelled.getAsBoolean()){IMedia.Stats stats=media.getStats();if(Math.abs(player.getTime()-target)<2000&&stats!=null&&stats.decodedAudio>decoded){reached=true;break;}Thread.sleep(100);}check(checks,"AUDIO-SEEK-SAMPLE",reached?"PASS":"FAIL");}else check(checks,"AUDIO-SEEK-SAMPLE","NOT_TESTED");
   out.put("audioOutput","dummy (silent; speaker/Bluetooth not tested)");
  }finally{if(player!=null){player.stop();player.release();}if(media!=null)media.release();if(lib!=null)lib.release();}
 }
}
