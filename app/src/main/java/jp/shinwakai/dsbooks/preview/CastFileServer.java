package jp.shinwakai.dsbooks.preview;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** One selected file, opaque URL, bounded memory, long byte ranges. No directory listing. */
final class CastFileServer implements AutoCloseable {
    private final File file;
    private final ServerSocket server;
    private final String path="/"+UUID.randomUUID()+"/audio.m4b";
    private final Set<Socket> clients=ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers=new ThreadPoolExecutor(3,3,10,TimeUnit.SECONDS,new ArrayBlockingQueue<>(3));
    private volatile boolean closed;
    CastFileServer(InetAddress address,File selected) throws IOException {
        if(!selected.isFile()||selected.length()==0)throw new IOException("Missing audio");file=selected;
        server=new ServerSocket(0,6,address);
        Thread accept=new Thread(()->{while(!closed)try{Socket socket=server.accept();socket.setSoTimeout(10000);clients.add(socket);try{workers.execute(()->serve(socket));}catch(RejectedExecutionException e){clients.remove(socket);socket.close();}}catch(IOException e){if(!closed)close();}},"DSBooks-Cast-HTTP");accept.setDaemon(true);accept.start();
    }
    String url(){return "http://"+server.getInetAddress().getHostAddress()+":"+server.getLocalPort()+path;}
    private String line(InputStream in) throws IOException {ByteArrayOutputStream b=new ByteArrayOutputStream();for(int i=0;i<8192;i++){int c=in.read();if(c<0)throw new EOFException();if(c=='\n')return b.toString("US-ASCII").replace("\r","");b.write(c);}throw new IOException("Long header");}
    private void headers(OutputStream out,int status,long length,String range) throws IOException {
        String reason=status==200?"OK":status==206?"Partial Content":status==204?"No Content":status==416?"Range Not Satisfiable":status==405?"Method Not Allowed":"Not Found";
        out.write(("HTTP/1.1 "+status+" "+reason+"\r\nContent-Length: "+length+"\r\nContent-Type: audio/mp4\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\nAccess-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\nCache-Control: no-store\r\nConnection: close\r\n"+(range==null?"":"Content-Range: "+range+"\r\n")+"\r\n").getBytes(StandardCharsets.US_ASCII));
    }
    private void serve(Socket socket){try(Socket client=socket){InputStream in=new BufferedInputStream(client.getInputStream());OutputStream out=client.getOutputStream();String[] request=line(in).split(" ");Map<String,String> hs=new HashMap<>();int read=0;String h;while(!(h=line(in)).isEmpty()){read+=h.length();if(read>16384)throw new IOException("Large headers");int sep=h.indexOf(':');if(sep>0){String key=h.substring(0,sep).toLowerCase(Locale.ROOT);if(hs.containsKey(key)&&key.equals("range"))throw new IOException("Multiple ranges");hs.put(key,h.substring(sep+1).trim());}}
        if(request.length!=3||!request[1].equals(path)){headers(out,404,0,null);return;}
        String method=request[0];if(method.equals("OPTIONS")){headers(out,204,0,null);return;}if(!method.equals("GET")&&!method.equals("HEAD")){headers(out,405,0,null);return;}
        long size=file.length(),start=0,end=size-1;String range=hs.get("range");
        if(range!=null)try{if(!range.matches("bytes=\\d*-\\d*"))throw new NumberFormatException();String[] parts=range.substring(6).split("-",-1);if(parts[0].isEmpty()){long suffix=Long.parseLong(parts[1]);if(suffix<=0)throw new NumberFormatException();start=Math.max(0,size-suffix);}else{start=Long.parseLong(parts[0]);if(!parts[1].isEmpty())end=Math.min(end,Long.parseLong(parts[1]));}if(start>=size||start<0||end<start)throw new NumberFormatException();}catch(NumberFormatException e){headers(out,416,0,"bytes */"+size);return;}
        headers(out,range==null?200:206,end-start+1,range==null?null:"bytes "+start+"-"+end+"/"+size);if(method.equals("HEAD"))return;
        try(RandomAccessFile src=new RandomAccessFile(file,"r")){src.seek(start);byte[] buffer=new byte[65536];long remaining=end-start+1;while(!closed&&remaining>0){int count=src.read(buffer,0,(int)Math.min(buffer.length,remaining));if(count<0)break;out.write(buffer,0,count);remaining-=count;}}
    }catch(IOException ignored){}finally{clients.remove(socket);}}
    @Override public void close(){closed=true;try{server.close();}catch(IOException ignored){}for(Socket s:clients)try{s.close();}catch(IOException ignored){}clients.clear();workers.shutdownNow();}
}
