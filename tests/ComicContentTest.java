package jp.shinwakai.dsbooks.preview;
import java.io.*;import java.nio.file.*;import java.util.*;import java.util.zip.*;
public class ComicContentTest {
 static void check(boolean yes,String message){if(!yes)throw new AssertionError(message);}
 public static void main(String[] args)throws Exception{
  File epub=new File(args[0]);int pages=EpubContent.read(epub,0).count;
  try(ZipFile z=new ZipFile(epub)){
   for(int i=0;i<pages;i++){EpubContent.Page p=EpubContent.read(epub,i);check(p.imageOnly&&p.images==1,"image page "+i);check(p.direction.equals("rtl"),"direction");check(!p.html.contains("<svg")&&!p.html.contains("<script"),"safe content");
    String data=p.html.substring(p.html.indexOf(";base64,")+8);data=data.substring(0,data.indexOf('"'));byte[] actual=Base64.getDecoder().decode(data);check(actual.length>100,"actual image "+i);
    if(i==32){Files.write(Paths.get(args[1],"epub-page.html"),p.html.getBytes("UTF-8"));Files.write(Paths.get(args[1],"epub-image.bin"),actual);}
   }
  }
  for(String name:new String[]{"sample.cbz","rar4.cbr","rar5.cbr","solid4.cbr","solid5.cbr"})try(ComicArchive c=new ComicArchive(new File(args[1],name))){check(c.count()==3,"page count "+name);check(c.name(0).endsWith("page1.png")&&c.name(1).endsWith("page2.png")&&c.name(2).endsWith("page10.png"),"natural ordering "+name);for(int i:new int[]{2,0,1,2}){byte[] expected=Files.readAllBytes(Paths.get(args[1],"pages",new File(c.name(i)).getName()));check(Arrays.equals(expected,c.page(i)),"decode "+name+" "+i);}}
  try(ComicArchive encrypted=new ComicArchive(new File(args[1],"encrypted.cbr"))){throw new AssertionError("encrypted archive accepted");}catch(IOException expected){check(expected.getMessage().contains("パスワード"),"clear password error");}
  check(ComicArchive.natural("99.png","100.png")<0,"natural order");check(!ComicArchive.image("../secret.png"),"traversal");check(!ComicArchive.image("__MACOSX/._a.png"),"mac metadata");
  System.out.println("PASS: actual EPUB "+pages+" image pages, SVG wrappers, RTL, full-resolution bytes; CBZ/RAR4/RAR5 image decode, natural sort, solid/non-solid random page order, encrypted error");
 }
}
