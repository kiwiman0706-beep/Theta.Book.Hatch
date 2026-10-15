package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public final class IsoChapterTest {
 static byte[] payload(int v)throws Exception{ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream o=new DataOutputStream(bytes);o.writeInt(v<<24);if(v==1)o.writeInt(0);o.writeByte(2);for(int i=0;i<2;i++){o.writeLong(i*600000000L);byte[] title=("章"+i).getBytes(StandardCharsets.UTF_8);o.writeByte(title.length);o.write(title);}return bytes.toByteArray();}
 static byte[] box(String type,byte[] body)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();DataOutputStream d=new DataOutputStream(b);d.writeInt(body.length+8);d.writeBytes(type);d.write(body);return b.toByteArray();}
 public static void main(String[] args)throws Exception{for(int v=0;v<2;v++){List<IsoChapterParser.Chapter> a=IsoChapterParser.parse(payload(v));if(a.size()!=2||a.get(1).timeMs!=60000||!a.get(0).title.equals("章0"))throw new AssertionError();File f=File.createTempFile("chapter-test-",".m4b");try(FileOutputStream out=new FileOutputStream(f)){out.write(box("mdat",new byte[1024]));out.write(box("moov",box("udta",box("chpl",payload(v)))));}if(IsoChapterParser.read(f).size()!=2)throw new AssertionError();f.delete();}
 if(!IsoChapterParser.parse(new byte[]{1,0,0}).isEmpty())throw new AssertionError();byte[] bad=payload(1);if(!IsoChapterParser.parse(Arrays.copyOf(bad,bad.length-2)).isEmpty())throw new AssertionError();System.out.println("PASS: chpl v0/v1, UTF8, milliseconds, box traversal, truncated input");}
}
