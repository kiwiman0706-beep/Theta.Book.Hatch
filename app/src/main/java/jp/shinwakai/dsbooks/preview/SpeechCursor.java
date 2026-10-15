package jp.shinwakai.dsbooks.preview;
/** UTF-16 offsets shared with DOM ranges; ignores callbacks from flushed utterances. */
final class SpeechCursor {
    String text="",id=""; int position,rangeStart=-1,rangeEnd=-1,chunkStart,chunkEnd,generation;
    boolean exact,completed,wanted;
    void reset(String value){cancel();text=value;position=0;rangeStart=rangeEnd=-1;completed=false;wanted=true;}
    void cancel(){id="";wanted=false;generation++;}
    boolean accepts(String value){return wanted&&!id.isEmpty()&&id.equals(value);}
    String next(String token){
        id="";wanted=true;completed=false;exact=false;rangeStart=rangeEnd=-1;
        int start=Math.max(0,Math.min(position,text.length()));
        if(start>0&&start<text.length()&&Character.isLowSurrogate(text.charAt(start)))start--;
        while(start<text.length()&&Character.isWhitespace(text.charAt(start)))start++;
        if(start>=text.length()){position=text.length();completed=true;wanted=false;return null;}
        int end=Math.min(text.length(),start+180);
        for(int i=start;i<end;i++)if("。！？!?\n".indexOf(text.charAt(i))>=0){end=i+1;break;}
        if(end<text.length()&&Character.isHighSurrogate(text.charAt(end-1)))end--;
        chunkStart=start;chunkEnd=end;position=start;id=token+":"+(++generation);
        return text.substring(start,end);
    }
    boolean begin(String value){if(!accepts(value))return false;rangeStart=chunkStart;rangeEnd=chunkEnd;exact=false;return true;}
    boolean range(String value,int start,int end){if(!accepts(value)||start<0||end<=start||end>chunkEnd-chunkStart)return false;rangeStart=chunkStart+start;rangeEnd=chunkStart+end;position=rangeStart;exact=true;return true;}
    boolean finish(String value){if(!accepts(value))return false;position=chunkEnd;id="";completed=position>=text.length();if(completed)wanted=false;return true;}
}
