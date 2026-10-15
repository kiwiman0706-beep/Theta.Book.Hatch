package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.nio.file.*;
import java.util.*;
public final class BookLocationTest {
 interface Attempt {void run()throws Exception;}
 static void reject(Attempt a)throws Exception{try{a.run();throw new AssertionError("accepted unsafe location");}catch(IOException expected){}}
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] args)throws Exception{
  String card="vol-0123456789abcdef01234567",other="vol-abcdef0123456789abcdef01";
  check(Arrays.equals(BookLocation.decode("old.epub"),new String[]{"internal","old.epub"}));
  check(BookLocation.encode("internal","old.epub").equals("old.epub"));
  check(Arrays.equals(BookLocation.decode(BookLocation.encode(card,"audio.m4b")),new String[]{card,"audio.m4b"}));
  check(!BookLocation.encode(card,"audio.m4b").equals(BookLocation.encode(other,"audio.m4b")));
  for(String s:new String[]{"",".","..","../book","folder/book","folder\\book","book\0x","vol-invalid--book",card+"--.."})reject(()->BookLocation.decode(s));
  reject(()->BookLocation.encode("untrusted-root","book.epub"));
  Path temp=Files.createTempDirectory("dsbooks-storage-test");
  try{
   File internal=Files.createDirectory(temp.resolve("internal")).toFile(),sd=Files.createDirectory(temp.resolve("sd")).toFile();
   Files.write(BookLocation.child(internal,"same.m4b").toPath(),new byte[]{1,2});Files.write(BookLocation.child(sd,"same.m4b").toPath(),new byte[]{3,4});
   check(Files.readAllBytes(BookLocation.child(internal,"same.m4b").toPath())[0]==1);check(Files.readAllBytes(BookLocation.child(sd,"same.m4b").toPath())[0]==3);
   Path outside=Files.createFile(temp.resolve("outside"));Files.createSymbolicLink(sd.toPath().resolve("escape"),outside);reject(()->BookLocation.child(sd,"escape"));
   reject(()->BookLocation.child(sd,"../outside"));
  }finally{try(java.util.stream.Stream<Path> paths=Files.walk(temp)){paths.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new RuntimeException(e);}});}}
  System.out.println("PASS: legacy paths, SD tokens, independent volumes, file reads/writes, traversal and symlink rejection");
 }
}
