package jp.shinwakai.dsbooks.preview;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;

/** Copies encoded audio samples only, without decoding or loading the whole book. */
final class AudioCompatibility {
    interface Progress { void update(int percent); }
    static void copyAudio(File source, File output, Progress progress) throws Exception {
        if (output.getParentFile().getUsableSpace() < source.length() + 32L * 1024 * 1024)
            throw new IOException("COMPAT_NO_SPACE");
        MediaExtractor ex = new MediaExtractor(); MediaMuxer mux = null;
        boolean complete = false;
        try {
            ex.setDataSource(source.getPath());
            int track = -1; MediaFormat format = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i); String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { track = i; format = f; break; }
            }
            if (track < 0) throw new IOException("COMPAT_NO_AUDIO");
            ex.selectTrack(track);
            mux = new MediaMuxer(output.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int outTrack = mux.addTrack(format); mux.start();
            ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long length = format.containsKey(MediaFormat.KEY_DURATION) ? format.getLong(MediaFormat.KEY_DURATION) : 0;
            long samples = 0, lastTime = -1; int lastProgress = -1;
            while (ex.getSampleTime() >= 0) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                int flags = ex.getSampleFlags();
                if ((flags & MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0) throw new IOException("COMPAT_ENCRYPTED");
                if ((flags & MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME) != 0) throw new IOException("COMPAT_PARTIAL_SAMPLE");
                long size = android.os.Build.VERSION.SDK_INT >= 28 ? ex.getSampleSize() : -2;
                if (size == -2 && buffer.capacity() < 8 * 1024 * 1024) buffer = ByteBuffer.allocateDirect(8 * 1024 * 1024);
                if (size != -2 && (size < 0 || size > 8L * 1024 * 1024)) throw new IOException("COMPAT_SAMPLE_TOO_LARGE");
                if (size > buffer.capacity()) buffer = ByteBuffer.allocateDirect((int)size);
                buffer.clear(); int n = ex.readSampleData(buffer, 0);
                if (n < 0 || (size != -2 && n != size)) throw new IOException("COMPAT_TRUNCATED_SAMPLE");
                long time = ex.getSampleTime();
                if (time < lastTime) throw new IOException("COMPAT_TIMESTAMPS");
                info.set(0, n, time, (flags & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
                mux.writeSampleData(outTrack, buffer, info); samples++; lastTime = time;
                int pct = length > 0 ? (int)Math.min(99, time * 100 / length) : 0;
                if (pct != lastProgress) { lastProgress = pct; progress.update(pct); }
                ex.advance();
            }
            if (samples == 0) throw new IOException("COMPAT_EMPTY_AUDIO");
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
            mux.stop(); complete = true;
        } finally {
            try { ex.release(); } finally {
                if (mux != null) try { mux.release(); } catch (Exception ignored) { }
                if (!complete) output.delete();
            }
        }
    }
}
