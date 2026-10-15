package jp.shinwakai.dsbooks.preview;
public class SpeechCursorTest {
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] args){SpeechCursor c=new SpeechCursor();c.reset("  最初の文。次の文。😀終わり");check(c.next("a").equals("最初の文。"));String old=c.id;check(c.begin(old));check(c.rangeStart==2);check(c.range(old,2,4));check(c.position==4);c.cancel();check(!c.finish(old));check(!c.range(old,0,1));check(c.next("a").equals("の文。"));check(c.finish(c.id));check(c.next("a").equals("次の文。"));check(c.finish(c.id));check(c.next("a").equals("😀終わり"));check(c.finish(c.id));check(c.completed);check(c.next("a")==null);c.reset("😀x");c.position=1;check(c.next("b").equals("😀x"));System.out.println("PASS SpeechCursor offsets/stale callbacks/pause/completion/surrogates");}
}
