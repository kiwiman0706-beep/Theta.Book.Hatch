package jp.shinwakai.dsbooks.preview;
import java.io.*;
import java.util.regex.*;
/** Stable storage token, independent of removable-volume enumeration order. */
final class BookLocation {
    static final String INTERNAL="internal";
    private static final Pattern EXTERNAL=Pattern.compile("^(vol-[0-9a-f]{24})--(.+)$");
    static String[] decode(String token)throws IOException{
        validateLeaf(token);Matcher m=EXTERNAL.matcher(token);
        if(m.matches()){validateLeaf(m.group(2));return new String[]{m.group(1),m.group(2)};}
        if(token.startsWith("vol-"))throw new IOException("保存先の識別子が不正です");
        return new String[]{INTERNAL,token};
    }
    static String encode(String id,String name)throws IOException{
        validateLeaf(name);if(INTERNAL.equals(id))return name;
        if(id==null||!id.matches("vol-[0-9a-f]{24}"))throw new IOException("保存先の識別子が不正です");
        return id+"--"+name;
    }
    static void validateLeaf(String n)throws IOException{
        if(n==null||n.isEmpty()||n.equals(".")||n.equals("..")||n.contains("/")||n.contains("\\")||n.indexOf('\0')>=0)throw new IOException("保存ファイル名が不正です");
    }
    static File child(File root,String name)throws IOException{
        validateLeaf(name);File base=root.getCanonicalFile(),file=new File(base,name).getCanonicalFile();
        if(!file.getPath().startsWith(base.getPath()+File.separator))throw new IOException("保存先の範囲外です");
        return file;
    }
}
