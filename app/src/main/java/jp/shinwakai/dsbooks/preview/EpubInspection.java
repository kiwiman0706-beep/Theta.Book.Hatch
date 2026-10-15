package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.net.URI;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.zip.*;
import javax.xml.parsers.*;
import javax.xml.XMLConstants;
import org.w3c.dom.*;
import org.xml.sax.InputSource;
/** Read-only package/XHTML/resource inspection. No book text leaves the result. */
final class EpubInspection {
 static final class Result {int entries,spine,checked,missing,characters;boolean partial;}
 static DocumentBuilder builder()throws Exception{DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);for(String feature:new String[]{"http://xml.org/sax/features/external-general-entities","http://xml.org/sax/features/external-parameter-entities","http://apache.org/xml/features/nonvalidating/load-external-dtd"})try{f.setFeature(feature,false);}catch(Exception ignored){}try{f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);}catch(Exception ignored){}try{f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");}catch(Exception ignored){}f.setExpandEntityReferences(false);DocumentBuilder b=f.newDocumentBuilder();b.setEntityResolver((pub,sys)->new InputSource(new StringReader("")));b.setErrorHandler(new org.xml.sax.helpers.DefaultHandler(){@Override public void fatalError(org.xml.sax.SAXParseException e)throws org.xml.sax.SAXException{throw e;}});return b;}
 static byte[] bytes(ZipFile z,String path,int limit)throws Exception{ZipEntry e=z.getEntry(path);if(e==null||e.isDirectory())throw new IOException("MISSING_ENTRY");if(e.getSize()>limit)throw new IOException("ENTRY_LIMIT");try(InputStream in=z.getInputStream(e);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n,total=0;while((n=in.read(b))!=-1){total+=n;if(total>limit)throw new IOException("ENTRY_LIMIT");out.write(b,0,n);}return out.toByteArray();}}
 static String resolve(String base,String href)throws Exception{URI ref=new URI(href.replace(" ","%20"));if(ref.isAbsolute()||ref.getRawAuthority()!=null)throw new IOException("EXTERNAL_RESOURCE");URI target=new URI(null,null,"/"+base,null).resolve(ref).normalize();String path=target.getPath();if(path==null||!path.startsWith("/")||path.contains("/../")||path.indexOf('\0')>=0)throw new IOException("INVALID_PATH");return path.substring(1);}
 static Result inspect(File file,BooleanSupplier cancelled)throws Exception{
  Result r=new Result();try(ZipFile z=new ZipFile(file)){r.entries=z.size();Document container=builder().parse(new ByteArrayInputStream(bytes(z,"META-INF/container.xml",1024*1024)));NodeList roots=container.getElementsByTagNameNS("*","rootfile");if(roots.getLength()==0)throw new IOException("NO_PACKAGE");String opf=((Element)roots.item(0)).getAttribute("full-path");Document pkg=builder().parse(new ByteArrayInputStream(bytes(z,opf,4*1024*1024)));Map<String,String> manifest=new HashMap<>();NodeList items=pkg.getElementsByTagNameNS("*","item");for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);manifest.put(e.getAttribute("id"),resolve(opf,e.getAttribute("href")));}NodeList refs=pkg.getElementsByTagNameNS("*","itemref");r.spine=refs.getLength();if(r.spine==0)throw new IOException("EMPTY_SPINE");long total=0;
   for(int i=0;i<r.spine;i++){if(cancelled.getAsBoolean())throw new InterruptedIOException("CANCELLED");if(i>=512||total>=32*1024*1024){r.partial=true;break;}String chapter=manifest.get(((Element)refs.item(i)).getAttribute("idref"));if(chapter==null||z.getEntry(chapter)==null){r.missing++;continue;}byte[] data;try{data=bytes(z,chapter,4*1024*1024);}catch(IOException e){if("ENTRY_LIMIT".equals(e.getMessage())){r.partial=true;continue;}throw e;}total+=data.length;Document doc=builder().parse(new ByteArrayInputStream(data));r.characters+=doc.getDocumentElement().getTextContent().length();r.checked++;
    NodeList all=doc.getElementsByTagName("*");for(int j=0;j<all.getLength();j++){Element el=(Element)all.item(j);String tag=el.getLocalName();if(!"img".equals(tag)&&!"image".equals(tag))continue;String href=el.getAttribute("src");if(href.isEmpty())href=el.getAttribute("href");if(href.isEmpty())href=el.getAttribute("xlink:href");if(href.isEmpty()||href.startsWith("data:")||href.startsWith("#"))continue;try{if(z.getEntry(resolve(chapter,href))==null)r.missing++;}catch(Exception e){r.missing++;}}
   }
  }return r;
 }
}
