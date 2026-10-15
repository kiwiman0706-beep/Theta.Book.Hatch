package jp.shinwakai.dsbooks.preview;
import com.sun.net.httpserver.*;
import java.net.*;import java.io.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;
public class NasAudioSourceTest {
 static AtomicInteger hits=new AtomicInteger();static long LARGE=3_000_000_123L;
 static void eq(Object a,Object b){if(!a.equals(b))throw new AssertionError(a+" != "+b);}
 static HttpURLConnection request(String url,String range,String method)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setReadTimeout(3000);c.setConnectTimeout(3000);c.setRequestMethod(method);if(range!=null)c.setRequestProperty("Range",range);return c;}
 static void check(NasAudioSource s,String range,int code,long start,int len)throws Exception{HttpURLConnection c=request(s.uri(),range,"GET");eq(c.getResponseCode(),code);byte[] data=c.getInputStream().readAllBytes();eq(data.length,len);for(int i=0;i<len;i++)eq(data[i],(byte)((start+i)%251));c.disconnect();}
 static void failure(String base,String route,String range,String expected)throws Exception{try(NasAudioSource s=new NasAudioSource(base+route,1000)){try{HttpURLConnection c=request(s.uri(),range,"GET");c.getInputStream().readAllBytes();throw new AssertionError("unexpected success");}catch(IOException fine){}eq(s.error(),expected);}}
 public static void main(String[] args)throws Exception{
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);ExecutorService executor=Executors.newCachedThreadPool();server.setExecutor(executor);
  server.createContext("/",e->{hits.incrementAndGet();String route=e.getRequestURI().getPath();try{
   if(route.equals("/auth")){byte[] b="{\"error\":{\"code\":119},\"success\":false}".getBytes();e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);return;}
   if(route.equals("/redirect")){e.getResponseHeaders().set("Location","/ok");e.sendResponseHeaders(302,-1);return;}
   long total=route.equals("/large")?LARGE:1000;String r=e.getRequestHeaders().getFirst("Range");long start=0,end=total-1;boolean ignore=route.equals("/ignore");
   if(r!=null&&!ignore){String[] p=r.substring(6).split("-",-1);if(p[0].isEmpty())start=Math.max(0,total-Long.parseLong(p[1]));else{start=Long.parseLong(p[0]);if(!p[1].isEmpty())end=Math.min(total-1,Long.parseLong(p[1]));}}
   if(route.equals("/bad"))start++;
   e.getResponseHeaders().set("Content-Type","audio/mp4");if(!ignore)e.getResponseHeaders().set("Content-Range","bytes "+start+"-"+end+"/"+total);
   e.sendResponseHeaders(ignore?200:206,end-start+1);
   byte[] b=new byte[1024];for(long at=start;at<=end;){int n=(int)Math.min(b.length,end-at+1);for(int i=0;i<n;i++)b[i]=(byte)((at+i)%251);e.getResponseBody().write(b,0,n);at+=n;}
  }catch(IOException clientClosed){}finally{e.close();}});server.start();String base="http://127.0.0.1:"+server.getAddress().getPort();
  try{
   try(NasAudioSource s=new NasAudioSource(base+"/ok",1000)){
    check(s,null,200,0,1000);check(s,"bytes=800-849",206,800,50);check(s,"bytes=-20",206,980,20);check(s,"bytes=995-5000",206,995,5);eq(s.rangeSupported(),true);
    HttpURLConnection head=request(s.uri(),null,"HEAD");eq(head.getResponseCode(),200);eq(head.getContentLengthLong(),1000L);eq(head.getInputStream().readAllBytes().length,0);head.disconnect();
    HttpURLConnection outside=request(s.uri(),"bytes=1000-","GET");eq(outside.getResponseCode(),416);outside.disconnect();
    int before=hits.get();HttpURLConnection bad=request(s.uri().replace("audio.m4b","wrong"),null,"GET");eq(bad.getResponseCode(),404);bad.disconnect();eq(hits.get(),before);
    HttpURLConnection multi=request(s.uri(),"bytes=0-1,8-9","GET");eq(multi.getResponseCode(),416);multi.disconnect();
   }
   try(NasAudioSource s=new NasAudioSource(base+"/large",LARGE)){check(s,"bytes="+(LARGE-51)+"-",206,LARGE-51,51);eq(s.receivedBytes(),51L);}
   try(NasAudioSource s=new NasAudioSource(base+"/ignore",1000)){check(s,null,200,0,1000);check(s,"bytes=0-19",206,0,20);}
   failure(base,"/ignore","bytes=900-","STREAM_RANGE_UNSUPPORTED");failure(base,"/auth",null,"STREAM_AUTH");failure(base,"/bad","bytes=100-199","STREAM_INVALID_RANGE");failure(base,"/redirect",null,"STREAM_HTTP_302");
   try(NasAudioSource s=new NasAudioSource(base+"/ok",999)){try{request(s.uri(),"bytes=0-1","GET").getInputStream();throw new AssertionError();}catch(IOException fine){}eq(s.error(),"STREAM_FILE_CHANGED");}
   NasAudioSource closed=new NasAudioSource(base+"/ok",1000);String url=closed.uri();closed.close();try{request(url,null,"GET").getInputStream();throw new AssertionError();}catch(IOException fine){}
   System.out.println("PASS: Range/HEAD/suffix/3GB offset/bounded transfer/token isolation/auth/redirect/invalid range/file change/close");
  }finally{server.stop(0);executor.shutdownNow();}
 }
}
