package android.media;
import java.nio.ByteBuffer;
public class MediaExtractor {
 public static final int SAMPLE_FLAG_SYNC=1,SAMPLE_FLAG_ENCRYPTED=2,SAMPLE_FLAG_PARTIAL_FRAME=4;
 public static int mode=0,selected=-1; public static boolean released=false; int sample;
 public void setDataSource(String s){released=false;selected=-1;}
 public int getTrackCount(){return 2;}
 public MediaFormat getTrackFormat(int n){return new MediaFormat(n==0?"text/plain":"audio/mp4a-latm");}
 public void selectTrack(int n){selected=n;}
 public long getSampleTime(){return sample<3?sample*15000000000L:-1;}
 public int getSampleFlags(){return mode==1?SAMPLE_FLAG_ENCRYPTED:mode==2?SAMPLE_FLAG_PARTIAL_FRAME:SAMPLE_FLAG_SYNC;}
 public long getSampleSize(){return mode==3?9L*1024*1024:sample==1?2*1024*1024:4;}
 public int readSampleData(ByteBuffer b,int o){int n=(int)getSampleSize();if(mode==4)return n-1;for(int i=0;i<n;i++)b.put(i,(byte)(sample+7));return n;}
 public boolean advance(){sample++;return sample<3;}
 public void release(){released=true;}
}
