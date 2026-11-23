package com.camhome.cameraai;

import android.content.Context;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

final class RecordingCapture extends Thread {
    private static final class Item {
        final Tnp.Frame frame;
        final long at = System.currentTimeMillis();
        Item(Tnp.Frame frame) { this.frame = frame; }
    }

    private final SegmentMuxer muxer;
    private final Context context;
    private final Consumer<String> events;
    private final ArrayBlockingQueue<Item> queue = new ArrayBlockingQueue<>(48);
    private final AtomicInteger queuedBytes = new AtomicInteger();
    private volatile boolean closing, overflow;

    RecordingCapture(Context context, String camera, Consumer<String> events) {
        super("CamHome MP4 writer");
        this.context = context.getApplicationContext();
        this.muxer = new SegmentMuxer(this.context, camera);
        this.events = events;
    }

    void accept(Tnp.Frame frame) {
        if (closing) return;
        int bytes = frame == null ? 0 : frame.data.length;
        if (queuedBytes.addAndGet(bytes) <= 8 * 1024 * 1024 && queue.offer(new Item(frame))) return;
        queuedBytes.addAndGet(-bytes);
        overflow = true;
        closing = true;
    }

    void discontinuity() { accept(null); }
    void finish() { closing = true; }

    @Override public void run() {
        boolean announced = false;
        try {
            RecordingPackage.recoverOnce(context);
            while (!closing || !queue.isEmpty()) {
                Item item = queue.poll(100, TimeUnit.MILLISECONDS);
                if (item == null) continue;
                if (item.frame == null) {
                    muxer.finish();
                    announced = false;
                    if (!closing) events.accept("waiting");
                    continue;
                }
                queuedBytes.addAndGet(-item.frame.data.length);
                muxer.append(item.frame, item.at);
                if (muxer.active() != announced) {
                    announced = muxer.active();
                    if (!closing) events.accept(announced ? "active" : "waiting");
                }
            }
            muxer.finish();
            events.accept(overflow ? "error" : "stopped");
        } catch (Exception failure) {
            closing = true;
            try { muxer.discard(); } catch (RuntimeException ignored) { }
            events.accept("error");
        } finally {
            queue.clear();
            muxer.close();
        }
    }
}
