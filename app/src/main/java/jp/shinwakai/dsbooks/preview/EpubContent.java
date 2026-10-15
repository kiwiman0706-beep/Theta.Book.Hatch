package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import org.w3c.dom.*;
/** Package-local images only. SVG image wrappers are flattened; no EPUB script/style is executed. */
final class EpubContent {
 static final int IMAGE_LIMIT=24*1024*1024;
 static final Set<String> ALLOWED=new HashSet<>(Arrays.asList("p","div","span","h1","h2","h3","h4","h5","h6","em","i","strong","b","u","blockquote","ul","ol","li","br","hr","pre","code","table","thead","tbody","tr","td","th","ruby","rt","rp"));
 static final Set<String> SKIP=new HashSet<>(Arrays.asList("head","script","style","iframe","object","embed","foreignobject","audio","video","title","desc"));
 static final class Page {int index,count,images;long imageBytes;String title="",html="",direction="ltr";boolean imageOnly;StringBuilder text=new StringBuilder();}
 static String tag(Node n){String s=n.getLocalName();if(s==null)s=n.getNodeName();int c=s.indexOf(':');return (c<0?s:s.substring(c+1)).toLowerCase(Locale.ROOT);}
 static String escape(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
 static String mime(String path){String s=path.toLowerCase(Locale.ROOT);return s.endsWith(".png")?"image/png":s.endsWith(".webp")?"image/webp":s.endsWith(".gif")?"image/gif":s.endsWith(".jpg")||s.endsWith(".jpeg")?"image/jpeg":"";}
 static Page read(File file,int requested)throws Exception{
  try(ZipFile z=new ZipFile(file)){
   Document c=EpubInspection.builder().parse(new ByteArrayInputStream(EpubInspection.bytes(z,"META-INF/container.xml",1024*1024)));
   NodeList roots=c.getElementsByTagNameNS("*","rootfile");if(roots.getLength()==0)throw new IOException("EPUBに本文情報がありません");
   String opf=((Element)roots.item(0)).getAttribute("full-path");Document pkg=EpubInspection.builder().parse(new ByteArrayInputStream(EpubInspection.bytes(z,opf,4*1024*1024)));
   Map<String,String> manifest=new HashMap<>();NodeList items=pkg.getElementsByTagNameNS("*","item");for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);manifest.put(e.getAttribute("id"),e.getAttribute("href"));}
   NodeList spine=pkg.getElementsByTagNameNS("*","itemref");if(spine.getLength()==0)throw new IOException("EPUBに本文がありません");
   Page p=new Page();p.count=spine.getLength();p.index=Math.max(0,Math.min(requested,p.count-1));
   NodeList spines=pkg.getElementsByTagNameNS("*","spine");if(spines.getLength()>0&&"rtl".equals(((Element)spines.item(0)).getAttribute("page-progression-direction")))p.direction="rtl";
   NodeList metas=pkg.getElementsByTagNameNS("*","meta");for(int i=0;i<metas.getLength();i++){Element e=(Element)metas.item(i);if("primary-writing-mode".equals(e.getAttribute("name"))&&"horizontal-rl".equals(e.getAttribute("content")))p.direction="rtl";}
   String href=manifest.get(((Element)spine.item(p.index)).getAttribute("idref"));if(href==null)throw new IOException("EPUB本文の参照先がありません");String path=EpubInspection.resolve(opf,href);
   Document doc=EpubInspection.builder().parse(new ByteArrayInputStream(EpubInspection.bytes(z,path,16*1024*1024)));
   NodeList titles=doc.getElementsByTagNameNS("*","title");if(titles.getLength()>0)p.title=titles.item(0).getTextContent();
   NodeList bodies=doc.getElementsByTagNameNS("*","body");Node body=bodies.getLength()>0?bodies.item(0):doc.getDocumentElement();StringBuilder html=new StringBuilder();append(body,html,z,path,p);p.html=html.toString();p.imageOnly=p.images==1&&p.text.toString().trim().isEmpty();
   if(p.html.trim().isEmpty())throw new IOException("このページに表示できる本文・画像がありません");return p;
  }
 }
 static void append(Node n,StringBuilder out,ZipFile z,String chapter,Page p)throws Exception{
  if(n.getNodeType()==Node.TEXT_NODE){p.text.append(n.getNodeValue());out.append(escape(n.getNodeValue()));return;}
  if(n.getNodeType()!=Node.ELEMENT_NODE)return;String tag=tag(n);if(SKIP.contains(tag))return;
  if("img".equals(tag)||"image".equals(tag)){
   Element e=(Element)n;String href=e.getAttribute("src");if(href.isEmpty())href=e.getAttribute("href");if(href.isEmpty())href=e.getAttributeNS("http://www.w3.org/1999/xlink","href");if(href.isEmpty())href=e.getAttribute("xlink:href");
   if(href.isEmpty())throw new IOException("ページ画像の参照先がありません");String path=EpubInspection.resolve(chapter,href),mime=mime(path);if(mime.isEmpty())throw new IOException("未対応の画像形式です（JPEG・PNG・WebP・GIFに対応）");
   byte[] bytes=EpubInspection.bytes(z,path,IMAGE_LIMIT);p.imageBytes+=bytes.length;if(p.imageBytes>32L*1024*1024)throw new IOException("このページの画像が大きすぎます");p.images++;
   out.append("<img class=\"epub-image\" alt=\"").append(escape(e.getAttribute("alt"))).append("\" src=\"data:").append(mime).append(";base64,").append(Base64.getEncoder().encodeToString(bytes)).append("\">");return;
  }
  boolean allowed=ALLOWED.contains(tag);if(allowed)out.append('<').append(tag).append('>');
  for(Node child=n.getFirstChild();child!=null;child=child.getNextSibling())append(child,out,z,chapter,p);
  if(allowed&&!"br".equals(tag)&&!"hr".equals(tag))out.append("</").append(tag).append('>');
 }
}
