package jp.shinwakai.dsbooks.preview;
import java.io.*;import java.nio.file.*;import java.util.zip.*;
public class EpubInspectionTest {
 static void check(boolean b){if(!b)throw new AssertionError();}
 static void entry(ZipOutputStream z,String p,String data)throws Exception{z.putNextEntry(new ZipEntry(p));z.write(data.getBytes(java.nio.charset.StandardCharsets.UTF_8));z.closeEntry();}
 public static void main(String[] args)throws Exception{
  Path temp=Files.createTempFile("dsbooks-epub-test", ".epub");try{
   try(ZipOutputStream z=new ZipOutputStream(Files.newOutputStream(temp))){entry(z,"META-INF/container.xml","<container><rootfiles><rootfile full-path='OEBPS/book.opf'/></rootfiles></container>");entry(z,"OEBPS/book.opf","<package><manifest><item id='a' href='chapter%20one.xhtml'/></manifest><spine><itemref idref='a'/></spine></package>");entry(z,"OEBPS/chapter one.xhtml","<html xmlns='http://www.w3.org/1999/xhtml'><body>本文<img src='../missing.jpg'/></body></html>");}
   EpubInspection.Result r=EpubInspection.inspect(temp.toFile(),()->false);check(r.spine==1&&r.checked==1&&r.missing==1&&r.characters>0);
   try{EpubInspection.inspect(temp.toFile(),()->true);throw new AssertionError();}catch(InterruptedIOException expected){}
   check(EpubInspection.resolve("OEBPS/text/ch1.xhtml","../images/page%201.jpg#x").equals("OEBPS/images/page 1.jpg"));
   try{EpubInspection.resolve("a","https://example.com/image");throw new AssertionError();}catch(IOException expected){}
   // External entities never read local secrets.
   String xml="<!DOCTYPE a [<!ENTITY external SYSTEM 'file:///etc/passwd'>]><a>&external;</a>";check(!EpubInspection.builder().parse(new ByteArrayInputStream(xml.getBytes())).getDocumentElement().getTextContent().contains("root:"));
  }finally{Files.delete(temp);}
  if(args.length>0){EpubInspection.Result r=EpubInspection.inspect(new File(args[0]),()->false);check(r.spine>0&&r.checked==r.spine&&r.missing==0&&!r.partial);System.out.println("Real EPUB PASS: spine="+r.spine+", checked="+r.checked+", missing="+r.missing);}
  System.out.println("PASS: EPUB package, percent-encoded resources, missing-image detection, cancellation, external entity blocking");
 }
}
