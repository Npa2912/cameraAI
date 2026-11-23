package com.camhome.cameraai;

import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.net.Uri;
import android.view.Surface;
import android.view.TextureView;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManager;
import com.facebook.react.uimanager.annotations.ReactProp;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

public final class Yiq6Package implements ReactPackage {
    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
        return Collections.singletonList(new Module(context));
    }

    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {
        return Collections.singletonList(new Manager());
    }

    public static final class Module extends ReactContextBaseJavaModule {
        private final ExecutorService executor = Executors.newSingleThreadExecutor();

        Module(ReactApplicationContext context) { super(context); }
        @Override public String getName() { return "CamHomeYiq6"; }

        private interface Work { Object run() throws IOException, GeneralSecurityException; }

        private void submit(Promise promise, Work work) {
            executor.execute(() -> {
                try { promise.resolve(work.run()); }
                catch (Tnp.AuthException rejected) {
                    promise.reject(rejected.result == 1 ? "auth" : "auth_result",
                        "Camera authentication result: " + rejected.result);
                } catch (Tnp.Timeout timeout) {
                    promise.reject(timeout.stage, "Camera response timed out.");
                } catch (Tnp.ProtocolException ignored) {
                    promise.reject("protocol", "Invalid or unsupported TNP reply.");
                } catch (IllegalArgumentException ignored) {
                    promise.reject("input", "Invalid LAN address or pairing data.");
                } catch (Exception ignored) {
                    promise.reject("offline", "Camera did not respond over LAN.");
                }
            });
        }

        @ReactMethod public void discover(Promise promise) {
            submit(promise, () -> {
                WritableArray found = Arguments.createArray();
                for (Map.Entry<String, String> camera : Tnp.scan().entrySet()) {
                    WritableMap map = Arguments.createMap();
                    map.putString("uid", camera.getKey());
                    map.putString("address", camera.getValue());
                    found.pushMap(map);
                }
                return found;
            });
        }

        @ReactMethod public void verify(String ip, String uid, String key, Promise promise) {
            submit(promise, () -> {
                try (Tnp session = new Tnp(ip, uid, key)) {
                    session.handshake(() -> !Thread.currentThread().isInterrupted());
                    session.authenticate(() -> !Thread.currentThread().isInterrupted());
                    return session.cameraUid();
                }
            });
        }

        @Override public void invalidate() {
            executor.shutdownNow();
            super.invalidate();
        }
    }

    public static final class Manager extends SimpleViewManager<Video> {
        @Override public String getName() { return "CamHomeYiq6Video"; }
        @Override protected Video createViewInstance(ThemedReactContext context) { return new Video(context); }

        @ReactProp(name = "stream")
        public void setStream(Video view, ReadableMap config) { view.configure(config); }

        @Override public void receiveCommand(Video view, String name, ReadableArray args) {
            if ("snapshot".equals(name)) view.snapshot();
            if ("recordStart".equals(name) && args != null && args.size() == 1) view.recordStart(args.getString(0));
            if ("recordStop".equals(name)) view.recordStop();
            if ("move".equals(name) && args != null && args.size() == 1) view.move(args.getInt(0));
        }

        @Override public void onDropViewInstance(Video view) {
            view.configure(null);
            super.onDropViewInstance(view);
        }
    }

    public static final class Video extends TextureView
            implements TextureView.SurfaceTextureListener, LifecycleEventListener {
        private final ThemedReactContext react;
        private ReadableMap config;
        private Worker worker;
        private boolean foreground, online, capturing;

        Video(ThemedReactContext react) {
            super(react);
            this.react = react;
            setSurfaceTextureListener(this);
        }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            react.addLifecycleEventListener(this);
            foreground = react.getLifecycleState() == LifecycleState.RESUMED;
            start();
        }

        @Override protected void onDetachedFromWindow() {
            foreground = false;
            stop();
            react.removeLifecycleEventListener(this);
            super.onDetachedFromWindow();
        }

        void configure(ReadableMap next) {
            if (Objects.equals(config, next)) return;
            stop();
            config = next;
            start();
        }

        private void emit(String viewer, String kind, String value) {
            if (!react.hasActiveReactInstance()) return;
            WritableMap event = Arguments.createMap();
            event.putString("viewer", viewer);
            event.putString("kind", kind);
            event.putString("value", value);
            react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("camhomeYiq6", event);
        }

        private void start() {
            SurfaceTexture texture = getSurfaceTexture();
            if (config == null || texture == null || worker != null ||
                !isAttachedToWindow() || !foreground) return;
            worker = new Worker(config.getString("viewer"), config.getString("address"),
                config.getString("uid"), config.getString("key"), new Surface(texture));
            worker.start();
        }

        private void stop() {
            online = false;
            if (worker != null) worker.cancel();
            worker = null;
        }

        void recordStart(String camera) {
            if (online && worker != null && camera != null && !camera.isEmpty()) worker.recordStart(camera);
        }

        void recordStop() { if (worker != null) worker.recordStop(); }

        void move(int direction) {
            if (online && worker != null && direction >= 1 && direction <= 4)
                worker.movement.compareAndSet(0, direction);
        }

        void snapshot() {
            if (!online || config == null || capturing) return;
            String viewer = config.getString("viewer");
            Bitmap image = getBitmap();
            if (image == null) {
                emit(viewer, "snapshotError", "");
                return;
            }
            capturing = true;
            new Thread(() -> {
                File file = null;
                try {
                    file = File.createTempFile("yiq6-", ".jpg", react.getFilesDir());
                    try (FileOutputStream output = new FileOutputStream(file)) {
                        if (!image.compress(Bitmap.CompressFormat.JPEG, 90, output))
                            throw new IOException();
                    }
                    String uri = Uri.fromFile(file).toString();
                    post(() -> emit(viewer, "snapshot", uri));
                } catch (Exception ignored) {
                    if (file != null) file.delete();
                    post(() -> emit(viewer, "snapshotError", ""));
                } finally {
                    image.recycle();
                    post(() -> capturing = false);
                }
            }, "CamHome snapshot").start();
        }

        @Override public void onHostResume() { foreground = true; start(); }
        @Override public void onHostPause() { foreground = false; stop(); }
        @Override public void onHostDestroy() { onHostPause(); }
        @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int w, int h) { start(); }
        @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int w, int h) { }
        @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) { }
        @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { stop(); return true; }

        private final class Worker extends Thread {
            private final String viewer, ip, uid, key;
            private final Surface surface;
            private volatile boolean cancelled;
            private final AtomicInteger movement = new AtomicInteger();
            private volatile RecordingCapture capture;
            private volatile boolean accepting;

            void recordStart(String camera) {
                if (capture != null) return;
                RecordingCapture next = new RecordingCapture(react, camera, value -> post(() -> {
                    emit(viewer, "recording", value);
                    if ("stopped".equals(value) || "error".equals(value)) capture = null;
                }));
                capture = next;
                accepting = true;
                emit(viewer, "recording", "waiting");
                next.start();
            }

            void recordStop() {
                accepting = false;
                RecordingCapture current = capture;
                if (current != null) current.finish();
            }

            private void recordFrame(Tnp.Frame frame) {
                RecordingCapture current = capture;
                if (accepting && current != null) current.accept(frame);
            }

            Worker(String viewer, String ip, String uid, String key, Surface surface) {
                super("CamHome YIQ6");
                this.viewer = viewer;
                this.ip = ip;
                this.uid = uid;
                this.key = key;
                this.surface = surface;
            }

            void cancel() { cancelled = true; recordStop(); interrupt(); }

            private void status(String value) {
                post(() -> {
                    if (worker != this) return;
                    online = value.equals("online");
                    emit(viewer, "status", value);
                });
            }

            @Override public void run() {
                try {
                    while (!cancelled) {
                        status("connecting");
                        try (Tnp session = new Tnp(ip, uid, key)) {
                            session.handshake(() -> !cancelled);
                            if (cancelled) return;
                            session.authenticate(() -> !cancelled);
                            if (cancelled) return;
                            session.startVideo();
                            play(session);
                        } catch (Tnp.AuthException rejected) {
                            status(rejected.result == 1 ? "auth" : "auth_result");
                            return;
                        } catch (IllegalArgumentException failure) {
                            status("input");
                            return;
                        } catch (Tnp.ProtocolException failure) {
                            status("protocol");
                            return;
                        } catch (Tnp.Timeout timeout) {
                            if (cancelled) return;
                            status(timeout.stage);
                        } catch (Exception failure) {
                            if (cancelled) return;
                            status("offline");
                        }
                        Thread.sleep(1200);
                    }
                } catch (InterruptedException ignored) {
                    // Activity paused or the Surface went away.
                } finally {
                    recordStop();
                    surface.release();
                }
            }

            private void play(Tnp session) throws IOException, GeneralSecurityException {
                long stopAt = 0, lastDecoded = Tnp.now();
                boolean displayed = false;
                FrameOrder order = new FrameOrder(this::recordFrame);
                try (Renderer renderer = new Renderer(surface)) {
                    while (!cancelled) {
                        if (stopAt != 0 && Tnp.now() >= stopAt) {
                            session.stopMove();
                            stopAt = 0;
                        }
                        int direction = stopAt == 0 ? movement.getAndSet(0) : 0;
                        if (direction != 0) {
                            stopAt = Tnp.now() + 120;
                            session.move(direction);
                        }
                        session.pump(frame -> order.feed(frame, renderer));
                        if (renderer.render()) {
                            lastDecoded = Tnp.now();
                            if (!displayed) status("online");
                            displayed = true;
                        }
                        if (Tnp.now() - lastDecoded > 8000 || order.stalled()) throw new IOException();
                    }
                } finally {
                    RecordingCapture current = capture;
                    if (accepting && current != null) current.discontinuity();
                    movement.set(0);
                    if (stopAt != 0) {
                        try { session.stopMove(); }
                        catch (IOException ignored) { }
                    }
                }
            }
        }
    }

    private static final class FrameOrder {
        private final Map<Integer, Tnp.Frame> pending = new HashMap<>();
        private int expected = -1, generation = -1;
        private long waiting;
        private final java.util.function.Consumer<Tnp.Frame> encoded;
        FrameOrder(java.util.function.Consumer<Tnp.Frame> encoded) { this.encoded = encoded; }

        boolean stalled() { return waiting != 0 && Tnp.now() - waiting > 2000; }

        void feed(Tnp.Frame frame, Renderer renderer) throws IOException {
            if (generation != -1 && frame.generation != generation) {
                if (!frame.key) return;
                renderer.close();
                pending.clear();
                expected = -1;
                waiting = 0;
            }
            if (expected == -1) {
                if (!frame.key) {
                    if (pending.size() >= 300) pending.clear();
                    pending.putIfAbsent(frame.seq, frame);
                    return;
                }
                generation = frame.generation;
                expected = frame.seq;
                pending.entrySet().removeIf(entry -> entry.getValue().generation != generation ||
                    ((entry.getKey() - expected) & 65535) > 300);
            }
            int distance = (frame.seq - expected) & 65535;
            if (distance >= 32768) return;
            if (distance > 300) throw new IOException();
            pending.putIfAbsent(frame.seq, frame);
            Tnp.Frame next;
            boolean advanced = false;
            while ((next = pending.remove(expected)) != null) {
                renderer.push(next);
                encoded.accept(next);
                expected = (expected + 1) & 65535;
                advanced = true;
            }
            if (pending.isEmpty()) waiting = 0;
            else if (advanced || waiting == 0) waiting = Tnp.now();
        }
    }

    private static final class Renderer implements AutoCloseable {
        private final Surface surface;
        private MediaCodec codec;
        private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        private long time, previous = -1;
        private boolean uptime, rendered;

        Renderer(Surface surface) { this.surface = surface; }

        void push(Tnp.Frame frame) throws IOException {
            if (codec == null) initialize(frame);
            drain();
            int index = codec.dequeueInputBuffer(20_000);
            if (index < 0) throw new IOException();
            ByteBuffer buffer = codec.getInputBuffer(index);
            if (buffer == null) throw new IOException();
            buffer.clear();
            if (frame.data.length > buffer.remaining()) throw new IOException();
            buffer.put(frame.data);
            if (previous == -1) uptime = frame.millis > 999;
            long stamp = uptime ? frame.millis : frame.seconds * 1000 + frame.millis;
            if (previous != -1) {
                long delta = uptime ? (stamp - previous) & 0xffffffffL : stamp - previous;
                if (delta < 0 || delta > 30_000) throw new IOException();
                time += Math.max(delta, 1) * 1000;
            }
            previous = stamp;
            codec.queueInputBuffer(index, 0, frame.data.length, time, 0);
        }

        private void initialize(Tnp.Frame frame) throws IOException {
            if (!frame.key || frame.width < 1 || frame.width > 3840 || frame.height < 1 ||
                frame.height > 2160) throw new IOException();
            MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC,
                frame.width, frame.height);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 2 * 1024 * 1024);
            parameterSets(frame.data, format);
            codec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            codec.configure(format, surface, null, 0);
            codec.start();
        }

        private void drain() {
            if (codec == null) return;
            int index;
            do {
                index = codec.dequeueOutputBuffer(info, 0);
                if (index >= 0) {
                    codec.releaseOutputBuffer(index, true);
                    rendered = true;
                }
            } while (index >= 0 || index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED);
        }

        boolean render() {
            drain();
            boolean result = rendered;
            rendered = false;
            return result;
        }

        @Override public void close() {
            if (codec != null) {
                try { codec.stop(); }
                catch (RuntimeException ignored) { }
                try { codec.release(); }
                catch (RuntimeException ignored) { }
            }
            codec = null;
            previous = -1;
            rendered = false;
        }
    }

    private static void parameterSets(byte[] data, MediaFormat format) {
        int start = -1, type = 0;
        for (int i = 2; i < data.length - 1; i++) {
            if (data[i] != 1 || data[i - 1] != 0 || data[i - 2] != 0) continue;
            int prefix = i > 2 && data[i - 3] == 0 ? i - 3 : i - 2;
            addParameterSet(data, start, prefix, type, format);
            start = prefix;
            type = data[i + 1] & 31;
        }
        addParameterSet(data, start, data.length, type, format);
    }

    private static void addParameterSet(byte[] data, int start, int end, int type, MediaFormat format) {
        if (type == 7 || type == 8) {
            format.setByteBuffer(type == 7 ? "csd-0" : "csd-1",
                ByteBuffer.wrap(Arrays.copyOfRange(data, start, end)));
        }
    }
}
