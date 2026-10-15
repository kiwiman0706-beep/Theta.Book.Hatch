package jp.shinwakai.dsbooks.preview;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.*;

/** Range relay bound only to loopback. NAS credentials never reach the player or reports.
 * No whole-file byte arrays, disk copies, or redirects. A new instance is made per playback.
 */
final class NasAudioSource implements Closeable {
    private final URL upstream;
    private final long expectedBytes;
    private final ServerSocket server;
    private final String path = "/" + UUID.randomUUID().toString() + "/audio.m4b";
    private final Set<Socket> clients = ConcurrentHashMap.newKeySet();
    private final Set<HttpURLConnection> connections = ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(4,4,0,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(4));
    private volatile boolean closed;
    private volatile String error = "";
    private volatile boolean rangeSupported;
    private final AtomicLong bytes = new AtomicLong();
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private static final Pattern CONTENT_RANGE = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)");

    NasAudioSource(String url, long size) throws IOException {
        upstream = new URL(url);
        if (!("http".equals(upstream.getProtocol()) || "https".equals(upstream.getProtocol())) || upstream.getHost().isEmpty() || upstream.getUserInfo()!=null)
            throw new IOException("STREAM_INVALID_URL");
        expectedBytes=Math.max(0,size);
        server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));
        Thread accept=new Thread(()->{while(!closed)try{
            Socket s=server.accept(); clients.add(s);
            try { workers.execute(()->serve(s)); } catch(RejectedExecutionException full){clients.remove(s);try{s.close();}catch(IOException ignored){}}
        }catch(IOException e){if(!closed)error="STREAM_LISTENER";}},"DSBooks-audio-relay");
        accept.setDaemon(true);accept.start();
    }
    String uri(){return "http://127.0.0.1:"+server.getLocalPort()+path;}
    String error(){return error;}
    boolean rangeSupported(){return rangeSupported;}
    long receivedBytes(){return bytes.get();}
    private void fail(String code)throws IOException{error=code;throw new IOException(code);}
    private static String line(InputStream in, int max)throws IOException{
        ByteArrayOutputStream b=new ByteArrayOutputStream(); int c;
        while((c=in.read())!=-1){if(c=='\n')break;if(c!='\r')b.write(c);if(b.size()>max)throw new IOException("HEADER_TOO_LARGE");}
        if(c==-1&&b.size()==0)return null;
        return b.toString("US-ASCII");
    }
    private static void reply(OutputStream out,int status,String extra)throws IOException{
        String reason=status==200?"OK":status==206?"Partial Content":status==416?"Range Not Satisfiable":status==404?"Not Found":"Bad Gateway";
        out.write(("HTTP/1.1 "+status+" "+reason+"\r\nConnection: close\r\nCache-Control: no-store\r\n"+extra+"\r\n").getBytes(StandardCharsets.US_ASCII));out.flush();
    }
    private void serve(Socket socket){
        HttpURLConnection c=null;boolean headersSent=false;
        try(Socket s=socket){
            s.setSoTimeout(10000);
            InputStream input=new BufferedInputStream(s.getInputStream());OutputStream out=s.getOutputStream();
            String request=line(input,4096);if(request==null)return;
            String[] parts=request.split(" ");
            if(parts.length!=3||!path.equals(parts[1])||!(parts[0].equals("GET")||parts[0].equals("HEAD"))){reply(out,404,"Content-Length: 0\r\n");return;}
            boolean head=parts[0].equals("HEAD");String range=null;int length=0;
            for(String l;(l=line(input,4096))!=null&&!l.isEmpty();){length+=l.length();if(length>16384)throw new IOException("HEADER_TOO_LARGE");int colon=l.indexOf(':');if(colon>0&&l.substring(0,colon).equalsIgnoreCase("Range"))range=l.substring(colon+1).trim();}
            long start=0,end=-1,suffix=-1;
            if(range!=null){
                Matcher m=RANGE.matcher(range);
                if(!m.matches()||(m.group(1).isEmpty()&&m.group(2).isEmpty())){reply(out,416,"Content-Length: 0\r\n");return;}
                try {if(m.group(1).isEmpty())suffix=Long.parseLong(m.group(2));else {start=Long.parseLong(m.group(1));if(!m.group(2).isEmpty())end=Long.parseLong(m.group(2));}}
                catch(NumberFormatException invalid){reply(out,416,"Content-Length: 0\r\n");return;}
                if(suffix==0||(end>=0&&end<start)||(expectedBytes>0&&suffix<0&&start>=expectedBytes)){reply(out,416,"Content-Length: 0\r\n"+(expectedBytes>0?"Content-Range: bytes */"+expectedBytes+"\r\n":""));return;}
            }
            if(closed)return;
            c=(HttpURLConnection)upstream.openConnection();connections.add(c);
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(30000);
            c.setRequestProperty("Accept-Encoding","identity");
            c.setRequestProperty("Range",head?"bytes=0-0":range==null?"bytes=0-":range);
            int status=c.getResponseCode();
            if(status==401||status==403)fail("STREAM_AUTH");
            if(status==416){reply(out,416,"Content-Length: 0\r\n");return;}
            if(status!=200&&status!=206)fail("STREAM_HTTP_"+status);
            String type=c.getContentType();
            if(type!=null&&(type.toLowerCase(Locale.ROOT).contains("json")||type.toLowerCase(Locale.ROOT).contains("text/"))){
                byte[] detail=new byte[4096];int n=c.getInputStream().read(detail);
                String body=n>0?new String(detail,0,n,StandardCharsets.UTF_8):"";
                fail(Pattern.compile("\"code\"\\s*:\\s*(106|107|119)\\b").matcher(body).find()?"STREAM_AUTH":"STREAM_API_RESPONSE");
            }
            String encoding=c.getHeaderField("Content-Encoding");if(encoding!=null&&!encoding.equalsIgnoreCase("identity"))fail("STREAM_ENCODING");
            long total,lengthOut,actualStart=0,actualEnd;
            if(status==206){
                Matcher m=CONTENT_RANGE.matcher(String.valueOf(c.getHeaderField("Content-Range")));
                if(!m.matches()) {fail("STREAM_INVALID_RANGE");return;}
                actualStart=Long.parseLong(m.group(1));actualEnd=Long.parseLong(m.group(2));total=Long.parseLong(m.group(3));
                long wantedStart=head?0:suffix>0?Math.max(0,total-suffix):start;
                long wantedEnd=head?0:end<0?total-1:Math.min(end,total-1);
                if(total<=0||actualStart!=wantedStart||actualEnd!=wantedEnd||actualEnd<actualStart||actualEnd>=total)fail("STREAM_INVALID_RANGE");
                lengthOut=actualEnd-actualStart+1;rangeSupported=true;
            }else{
                if(!head&&(start!=0||suffix>0))fail("STREAM_RANGE_UNSUPPORTED");
                total=c.getContentLengthLong();if(total<=0)fail("STREAM_LENGTH_UNKNOWN");
                actualEnd=total-1;lengthOut=total;
                // A bounded request cannot silently become a full-file response.
                if(!head&&end>=0) {actualEnd=Math.min(end,total-1);lengthOut=actualEnd+1;}
            }
            if(expectedBytes>0&&total!=expectedBytes)fail("STREAM_FILE_CHANGED");
            if(head){reply(out,200,"Content-Type: audio/mp4\r\nContent-Length: "+total+"\r\nAccept-Ranges: bytes\r\n");return;}
            int response=range==null?200:206;
            reply(out,response,"Content-Type: audio/mp4\r\nContent-Length: "+lengthOut+"\r\nAccept-Ranges: bytes\r\n"+(response==206?"Content-Range: bytes "+actualStart+"-"+actualEnd+"/"+total+"\r\n":""));headersSent=true;
            try(InputStream data=c.getInputStream()){
                byte[] buffer=new byte[65536];long left=lengthOut;
                while(left>0&&!closed){int n;try{n=data.read(buffer,0,(int)Math.min(left,buffer.length));}catch(IOException e){error="STREAM_CONNECTION";throw e;}
                    if(n<0){fail("STREAM_TRUNCATED");break;}bytes.addAndGet(n);left-=n;
                    try{out.write(buffer,0,n);}catch(IOException clientStopped){return;}
                }
            }
        }catch(Exception e){
            if(!closed&&!headersSent&&error.isEmpty())error="STREAM_CONNECTION";
            // Do not expose exception messages: they can contain the session URL.
        }finally{clients.remove(socket);if(c!=null){connections.remove(c);c.disconnect();}}
    }
    @Override public void close(){closed=true;try{server.close();}catch(IOException ignored){}for(Socket s:clients)try{s.close();}catch(IOException ignored){}for(HttpURLConnection c:connections)c.disconnect();workers.shutdownNow();}
}
