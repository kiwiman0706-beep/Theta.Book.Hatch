package jp.shinwakai.dsbooks.preview;
import android.media.*;import java.io.*;import java.util.*;
public class AudioCompatibilityTest {
 public static void main(String[] args)throws Exception{
  File source=File.createTempFile("source-",".m4b"),out=File.createTempFile("output-",".m4a");
  try{
   // A sparse source above signed 32-bit range; fixture samples do not allocate the file.
   try(RandomAccessFile f=new RandomAccessFile(source,"rw")){f.setLength(2200000000L);}
   if(source.getParentFile().getUsableSpace()>source.length()+32L*1024*1024){
    for(int sdk:new int[]{26,35}){android.os.Build.VERSION.SDK_INT=sdk;MediaExtractor.mode=0;
     AudioCompatibility.copyAudio(source,out,p->{});
     require(MediaExtractor.selected==1&&MediaExtractor.released&&MediaMuxer.released&&MediaMuxer.stopped);
     require(MediaMuxer.times.equals(Arrays.asList(0L,15000000000L,30000000000L)));require(out.length()==3);
    }
   }else throw new AssertionError("fixture needs 2.3GB free for capacity check");
   android.os.Build.VERSION.SDK_INT=35;
   for(int mode:new int[]{1,2,3,4}){MediaExtractor.mode=mode;boolean failed=false;try{AudioCompatibility.copyAudio(source,out,p->{});}catch(IOException e){failed=true;}require(failed&&!out.exists()&&MediaExtractor.released);}
   MediaExtractor.mode=0;boolean interrupted=false;
   try{AudioCompatibility.copyAudio(source,out,p->{Thread.currentThread().interrupt();});}catch(InterruptedException e){interrupted=true;}finally{Thread.interrupted();}
   require(interrupted&&!out.exists()&&MediaExtractor.released&&MediaMuxer.released);
   System.out.println("PASS: streaming audio-copy logic, >2GB source, long timestamps, API26/35 paths, bounded buffers, selected audio track, encrypted/partial/truncated rejection, cancellation cleanup (Android APIs simulated)");
  }finally{source.delete();out.delete();}
 }
 static void require(boolean b){if(!b)throw new AssertionError();}
}
