package android.media;
import java.io.*;import java.nio.ByteBuffer;import java.util.*;
public class MediaMuxer {
 public static class OutputFormat{public static final int MUXER_OUTPUT_MPEG_4=0;}
 public static final List<Long> times=new ArrayList<>();public static boolean stopped,released;private final FileOutputStream out;
 public MediaMuxer(String path,int type)throws Exception{out=new FileOutputStream(path);times.clear();stopped=false;released=false;}
 public int addTrack(MediaFormat f){if(!f.getString("mime").startsWith("audio/"))throw new AssertionError();return 0;}
 public void start(){}
 public void writeSampleData(int t,ByteBuffer b,MediaCodec.BufferInfo i)throws Exception{
  if(i.flags!=1||b.get(0)!=(byte)(times.size()+7)||b.get(i.size-1)!=(byte)(times.size()+7))throw new AssertionError();
  if(b.capacity()>8*1024*1024)throw new AssertionError();times.add(i.presentationTimeUs);out.write(b.get(0));
 }
 public void stop(){stopped=true;}public void release()throws Exception{released=true;out.close();}
}
