package android.media;
public class MediaCodec {
 public static final int BUFFER_FLAG_KEY_FRAME=1;
 public static class BufferInfo {
  public int size,flags;public long presentationTimeUs;
  public void set(int offset,int n,long time,int f){size=n;presentationTimeUs=time;flags=f;}
 }
}
