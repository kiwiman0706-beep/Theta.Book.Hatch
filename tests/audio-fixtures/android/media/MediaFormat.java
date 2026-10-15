package android.media;
public class MediaFormat {
 public static final String KEY_MIME="mime", KEY_DURATION="duration";
 final String mime; public MediaFormat(String m){mime=m;}
 public String getString(String k){return mime;} public boolean containsKey(String k){return true;}
 public long getLong(String k){return 45000000000L;}
}
