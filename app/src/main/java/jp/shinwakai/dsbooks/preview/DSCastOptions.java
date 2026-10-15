package jp.shinwakai.dsbooks.preview;
import android.content.Context;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.framework.*;
import com.google.android.gms.cast.framework.media.CastMediaOptions;
import java.util.List;
public final class DSCastOptions implements OptionsProvider {
    @Override public CastOptions getCastOptions(Context context){return new CastOptions.Builder().setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID).setResumeSavedSession(false).setEnableReconnectionService(false).setStopReceiverApplicationWhenEndingSession(true).setCastMediaOptions(new CastMediaOptions.Builder().setMediaSessionEnabled(false).setNotificationOptions(null).build()).build();}
    @Override public List<SessionProvider> getAdditionalSessionProviders(Context context){return null;}
}
