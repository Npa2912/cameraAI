package com.camhome.cameraai;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.StatFs;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

final class SegmentMuxer {
    private static final long SEGMENT_MS = 300_000;
    private static final long DAY_MS = 86_400_000;
    private static final long VIETNAM_OFFSET_MS = 7 * 3_600_000;
    private static final long RESERVE_BYTES = 128 * 1024 * 1024;
    private final RecordingIndex index;
    private final String camera;
    private MediaMuxer muxer;
    private String id;
    private long startedAt, previousStamp = -1, ptsUs, lastDeltaUs = 66_667;
    private int track, samples, generation;
    private boolean uptime;
    private byte[] sps, pps;
    private boolean idr;

    SegmentMuxer(Context context, String camera) {
        this.index = new RecordingIndex(context);
        this.camera = camera;
    }

    void append(Tnp.Frame frame, long wallMs) throws IOException {
        if (muxer != null && (generation != frame.generation || day(wallMs) != day(startedAt)
            || frame.key && wallMs / SEGMENT_MS != startedAt / SEGMENT_MS)) finish();

        byte[] sample = split(frame.data);
        if (sample.length == 0) return;
        if (muxer == null) {
            if (!idr || sps == null || pps == null) return;
            open(frame, wallMs);
        }

        if (samples % 30 == 0 && new StatFs(index.directory().getPath()).getAvailableBytes() < RESERVE_BYTES)
            throw new IOException("Local recording storage is full");

        long timestamp = uptime ? frame.millis : frame.seconds * 1000 + frame.millis;
        if (previousStamp >= 0) {
            long delta = uptime ? (timestamp - previousStamp) & 0xffffffffL : timestamp - previousStamp;
            if (delta < 0 || delta > 2000) {
                finish();
                return;
            }
            lastDeltaUs = Math.max(delta, 1) * 1000;
            ptsUs += lastDeltaUs;
        }
        previousStamp = timestamp;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        info.set(0, sample.length, ptsUs, idr ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
        muxer.writeSampleData(track, ByteBuffer.wrap(sample), info);
        samples++;
    }

    private static long day(long time) { return Math.floorDiv(time + VIETNAM_OFFSET_MS, DAY_MS); }

    boolean active() { return muxer != null && samples > 0; }

    private void open(Tnp.Frame frame, long wallMs) throws IOException {
        File directory = index.directory();
        if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException();
        if (new StatFs(directory.getPath()).getAvailableBytes() < RESERVE_BYTES) throw new IOException();
        id = UUID.randomUUID().toString();
        generation = frame.generation;
        startedAt = wallMs;
        previousStamp = -1;
        ptsUs = 0;
        lastDeltaUs = 66_667;
        samples = 0;
        uptime = frame.millis > 999;
        index.begin(id, camera, startedAt, frame.width, frame.height);
        muxer = new MediaMuxer(index.file(id, true).getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        MediaFormat format = MediaFormat.createVideoFormat("video/avc", frame.width, frame.height);
        format.setByteBuffer("csd-0", ByteBuffer.wrap(sps));
        format.setByteBuffer("csd-1", ByteBuffer.wrap(pps));
        track = muxer.addTrack(format);
        muxer.start();
    }

    private byte[] split(byte[] data) throws IOException {
        int start = startCode(data, 0);
        if (start < 0) throw new IOException("Missing AVC start code");
        ByteArrayOutputStream sample = new ByteArrayOutputStream(data.length);
        byte[] prefix = {0, 0, 0, 1};
        idr = false;
        boolean hasSlice = false;
        while (start >= 0) {
            int header = start + (data[start + 2] == 1 ? 3 : 4);
            if (header >= data.length) break;
            int next = startCode(data, header + 1);
            int end = next < 0 ? data.length : next;
            int type = data[header] & 31;
            if (type == 7 || type == 8) {
                byte[] parameter = new byte[prefix.length + end - header];
                System.arraycopy(prefix, 0, parameter, 0, prefix.length);
                System.arraycopy(data, header, parameter, prefix.length, end - header);
                if (type == 7) sps = parameter;
                else pps = parameter;
            } else {
                if (type == 5) idr = true;
                if (type >= 1 && type <= 5) hasSlice = true;
                sample.write(prefix, 0, prefix.length);
                sample.write(data, header, end - header);
            }
            start = next;
        }
        return hasSlice ? sample.toByteArray() : new byte[0];
    }

    private static int startCode(byte[] data, int from) {
        for (int i = from; i + 2 < data.length; i++) {
            if (data[i] == 0 && data[i + 1] == 0 &&
                (data[i + 2] == 1 || i + 3 < data.length && data[i + 2] == 0 && data[i + 3] == 1))
                return i;
        }
        return -1;
    }

    void finish() throws IOException {
        if (muxer == null) return;
        MediaMuxer current = muxer;
        muxer = null;
        long durationUs = ptsUs + lastDeltaUs;
        try {
            if (samples == 0) throw new IOException("Empty recording");
            MediaCodec.BufferInfo end = new MediaCodec.BufferInfo();
            end.set(0, 0, durationUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            current.writeSampleData(track, ByteBuffer.allocate(0), end);
            current.stop();
        } finally {
            current.release();
        }
        File partial = index.file(id, true);
        check(partial);
        long end = startedAt + Math.max(1, durationUs / 1000);
        long midnight = (day(startedAt) + 1) * DAY_MS - VIETNAM_OFFSET_MS;
        index.prepared(id, Math.min(midnight, end), partial.length(), sha256(partial), samples);
        String prepared = id;
        id = null;
        if (!partial.renameTo(index.file(prepared, false))) throw new IOException("Could not publish recording");
        index.state(prepared, "ready");
    }

    private static void check(File file) throws IOException {
        MediaExtractor reader = new MediaExtractor();
        try {
            reader.setDataSource(file.getAbsolutePath());
            if (reader.getTrackCount() != 1 || !"video/avc".equals(reader.getTrackFormat(0).getString(MediaFormat.KEY_MIME)))
                throw new IOException("Unexpected MP4 track");
            reader.selectTrack(0);
            if (reader.getSampleTime() < 0 || (reader.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) == 0)
                throw new IOException("Missing initial sync sample");
        } finally {
            reader.release();
        }
    }

    private static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[64 * 1024];
                int count;
                while ((count = input.read(bytes)) >= 0) digest.update(bytes, 0, count);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest()) hex.append(Character.forDigit((b >> 4) & 15, 16)).append(Character.forDigit(b & 15, 16));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IOException(impossible);
        }
    }

    void discard() {
        if (muxer != null) {
            try { muxer.release(); } catch (RuntimeException ignored) { }
            muxer = null;
        }
        if (id != null && !index.file(id, false).exists()) {
            index.state(id, "interrupted");
            index.file(id, true).delete();
        }
    }

    void close() { index.close(); }
}
