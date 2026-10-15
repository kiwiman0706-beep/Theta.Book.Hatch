package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Nero chpl v0/v1 reader: follows MP4 box boundaries and skips media bytes. */
final class IsoChapterParser {
    static final class Chapter { final String title; final long timeMs;Chapter(String title,long timeMs){this.title=title;this.timeMs=timeMs;} }
    static List<Chapter> read(File file)throws IOException {try(RandomAccessFile in=new RandomAccessFile(file,"r")){return boxes(in,0,in.length(),0,new int[]{0});}}
    private static List<Chapter> boxes(RandomAccessFile in,long from,long end,int depth,int[] visited)throws IOException {
        if(depth>6)return Collections.emptyList();
        long pos=from;
        while(end-pos>=8&&visited[0]++<10000){in.seek(pos);long size=in.readInt()&0xffffffffL;int type=in.readInt();long header=8;
            if(size==1){if(end-pos<16)return Collections.emptyList();size=in.readLong();header=16;}
            if(size==0)size=end-pos;
            if(size<header||size>end-pos)return Collections.emptyList();
            if(type==0x6368706c && size-header<=1024*1024){byte[] data=new byte[(int)(size-header)];in.readFully(data);List<Chapter> found=parse(data);if(!found.isEmpty())return found;}
            if(type==0x6d6f6f76||type==0x75647461){List<Chapter> found=boxes(in,pos+header,pos+size,depth+1,visited);if(!found.isEmpty())return found;}
            pos+=size;
        }
        return Collections.emptyList();
    }
    static List<Chapter> parse(byte[] data){
        if(data.length<5)return Collections.emptyList();int version=data[0]&255;if(version>1)return Collections.emptyList();int at=version==0?4:8;if(at>=data.length)return Collections.emptyList();int count=data[at++]&255;List<Chapter> result=new ArrayList<>();long previous=-1;
        for(int n=0;n<count;n++){if(data.length-at<9)return Collections.emptyList();long ticks=0;for(int i=0;i<8;i++)ticks=(ticks<<8)|(data[at++]&255L);int len=data[at++]&255;if(ticks<0||len>data.length-at||ticks/10000<previous)return Collections.emptyList();String title=new String(data,at,len,StandardCharsets.UTF_8);at+=len;previous=ticks/10000;result.add(new Chapter(title,previous));}
        return result;
    }
}
