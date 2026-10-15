package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import com.github.junrar.Archive;
import com.github.junrar.ArchiveOptions;
import com.github.junrar.rarfile.FileHeader;
/** Read one image at a time; never extracts archive filenames onto the filesystem. */
final class ComicArchive implements AutoCloseable {
 static final int MAX_IMAGE=24*1024*1024,MAX_PAGES=10000;
 private ZipFile zip;private Archive rar;
 private final List<String> names=new ArrayList<>();private final Map<String,FileHeader> headers=new HashMap<>();
 final String format;
 ComicArchive(File f)throws Exception{
  byte[] magic=new byte[8];try(InputStream in=new FileInputStream(f)){in.read(magic);}
  format=magic[0]=='P'&&magic[1]=='K'?"CBZ":"CBR";
  try{
   if(format.equals("CBZ")){zip=new ZipFile(f);if(zip.size()>30000)throw new IOException("アーカイブ内の項目が多すぎます");Enumeration<? extends ZipEntry> it=zip.entries();while(it.hasMoreElements()){ZipEntry e=it.nextElement();if(!e.isDirectory()&&image(e.getName())){size(e.getSize());names.add(e.getName());}}}
   else{rar=new Archive(f,ArchiveOptions.builder().maxDictionarySize(32L*1024*1024).build());if(rar.isEncrypted())throw new IOException("パスワード付きCBRにはまだ対応していません");if(rar.getFileHeaders().size()>30000||!rar.getHeaderFailures().isEmpty())throw new IOException("CBRの一覧を完全に読み取れません");
    for(FileHeader h:rar.getFileHeaders()){if(h.isSplitBefore()||h.isSplitAfter())throw new IOException("分割CBRにはまだ対応していません");if(h.isEncrypted())throw new IOException("パスワード付きCBRにはまだ対応していません");if(!h.isDirectory()&&h.getRedirection()==null&&image(h.getFileName())){size(h.getFullUnpackSize());names.add(h.getFileName());headers.put(h.getFileName(),h);}}}
   if(names.isEmpty())throw new IOException("JPEG・PNG・WebP・GIFのページ画像がありません");if(names.size()>MAX_PAGES)throw new IOException("ページ数が上限を超えています");if(new HashSet<>(names).size()!=names.size())throw new IOException("同じ名前のページが重複しています");names.sort(ComicArchive::natural);
  }catch(Exception e){close();throw e;}
 }
 static void size(long n)throws IOException{if(n<0||n>MAX_IMAGE)throw new IOException("ページ画像は24MB以下にしてください");}
 static boolean image(String n){String normalized=n.replace('\\','/');if(normalized.startsWith("/")||normalized.contains("../")||normalized.startsWith("__MACOSX/")||normalized.contains("/.")||normalized.startsWith("."))return false;return !EpubContent.mime(n).isEmpty();}
 int count(){return names.size();}String name(int index){return names.get(Math.max(0,Math.min(index,count()-1)));}
 byte[] page(int index)throws Exception{
  String name=name(index);LimitedOutput out=new LimitedOutput();
  if(zip!=null){ZipEntry e=zip.getEntry(name);try(InputStream in=zip.getInputStream(e)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}byte[] bytes=out.toByteArray();CRC32 crc=new CRC32();crc.update(bytes);if(e.getCrc()!=crc.getValue())throw new IOException("ページ画像のCRCが一致しません");return bytes;}
  rar.extractFile(headers.get(name),out);return out.toByteArray();
 }
 static final class LimitedOutput extends OutputStream {
  final ByteArrayOutputStream bytes=new ByteArrayOutputStream();final long deadline=System.nanoTime()+30000000000L;
  void check(int n)throws IOException{if(Thread.currentThread().isInterrupted()||System.nanoTime()>deadline)throw new InterruptedIOException("ページ展開を中断しました");if((long)bytes.size()+n>MAX_IMAGE)throw new IOException("ページ画像が大きすぎます");}
  public void write(int b)throws IOException{check(1);bytes.write(b);}public void write(byte[] b,int o,int n)throws IOException{check(n);bytes.write(b,o,n);}byte[] toByteArray(){return bytes.toByteArray();}
 }
 static int natural(String a,String b){int i=0,j=0;while(i<a.length()&&j<b.length()){char x=a.charAt(i),y=b.charAt(j);if(x>='0'&&x<='9'&&y>='0'&&y<='9'){int ae=i,be=j;while(ae<a.length()&&Character.isDigit(a.charAt(ae)))ae++;while(be<b.length()&&Character.isDigit(b.charAt(be)))be++;String av=a.substring(i,ae).replaceFirst("^0+(?!$)",""),bv=b.substring(j,be).replaceFirst("^0+(?!$)","");int c=Integer.compare(av.length(),bv.length());if(c==0)c=av.compareTo(bv);if(c!=0)return c;i=ae;j=be;}else{int c=Character.compare(Character.toLowerCase(x),Character.toLowerCase(y));if(c!=0)return c;i++;j++;}}int c=Integer.compare(a.length()-i,b.length()-j);return c!=0?c:a.compareTo(b);}
 public void close(){try{if(zip!=null)zip.close();}catch(Exception ignored){}try{if(rar!=null)rar.close();}catch(Exception ignored){}zip=null;rar=null;}
}
