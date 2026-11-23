package com.camhome.cameraai;

import android.content.Context;
import android.media.MediaPlayer;
import android.net.Uri;
import android.widget.FrameLayout;
import android.widget.VideoView;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManager;
import com.facebook.react.uimanager.annotations.ReactProp;
import java.io.File;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class RecordingPackage implements ReactPackage {
    private static boolean recovered;

    static synchronized void recoverOnce(Context context) {
        if (recovered) return;
        try (RecordingIndex store = new RecordingIndex(context)) { store.recover(); }
        recovered = true;
    }

    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
        return Collections.singletonList(new Module(context));
    }
    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {
        return Collections.singletonList(new PlayerManager());
    }

    public static final class Module extends ReactContextBaseJavaModule {
        private final ReactApplicationContext context;
        private final ExecutorService reader = Executors.newSingleThreadExecutor();
        Module(ReactApplicationContext context) { super(context); this.context = context; }
        @Override public String getName() { return "CamHomeRecordings"; }

        @ReactMethod public void list(String camera, Promise promise) {
            reader.execute(() -> {
                try (RecordingIndex index = new RecordingIndex(context)) {
                    recoverOnce(context);
                    promise.resolve(index.list(camera));
                } catch (RuntimeException ignored) {
                    promise.reject("recordings", "Could not read recording index.");
                }
            });
        }

        @Override public void invalidate() { reader.shutdownNow(); super.invalidate(); }
    }

    public static final class PlayerManager extends SimpleViewManager<Player> {
        @Override public String getName() { return "CamHomeRecordingPlayer"; }
        @Override protected Player createViewInstance(ThemedReactContext context) {
            return new Player(context);
        }
        @ReactProp(name = "clip") public void clip(Player view, ReadableMap config) { view.load(config); }
        @Override public void receiveCommand(Player view, String name, ReadableArray args) {
            if ("toggle".equals(name)) {
                if (view.video.isPlaying()) view.video.pause();
                else view.video.start();
            }
            if ("skip".equals(name) && args != null && args.size() == 1 && view.video.getDuration() > 0) {
                int position = view.video.getCurrentPosition() + args.getInt(0);
                view.video.seekTo(Math.max(0, Math.min(position, view.video.getDuration() - 1)));
            }
        }
        @Override public void onDropViewInstance(Player view) {
            view.video.stopPlayback();
            super.onDropViewInstance(view);
        }
    }

    public static final class Player extends FrameLayout {
        final VideoView video;
        private final ThemedReactContext context;
        private String token;
        private int offset;

        Player(ThemedReactContext context) {
            super(context);
            this.context = context;
            video = new VideoView(context);
            LayoutParams centered = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, android.view.Gravity.CENTER);
            addView(video, centered);
            video.setOnPreparedListener(media -> {
                if (offset > 0) {
                    media.setOnSeekCompleteListener(player -> {
                        if (android.os.Build.VERSION.SDK_INT >= 26) pulse("seeked", player.getCurrentPosition());
                        player.start();
                    });
                    if (android.os.Build.VERSION.SDK_INT >= 26) media.seekTo(offset, MediaPlayer.SEEK_CLOSEST);
                    else media.seekTo(offset);
                } else video.start();
                pulse("ready", 0);
            });
            video.setOnCompletionListener(media -> pulse("ended", 0));
            video.setOnErrorListener((media, what, extra) -> {
                pulse("error", 0);
                return true;
            });
        }

        void load(ReadableMap config) {
            video.stopPlayback();
            if (config == null) { token = null; return; }
            token = config.getString("token");
            offset = Math.max(0, config.getInt("offset"));
            try (RecordingIndex index = new RecordingIndex(context)) {
                File file = index.file(config.getString("id"), false);
                if (!file.isFile()) { pulse("error", 0); return; }
                video.setVideoURI(Uri.fromFile(file));
            } catch (IllegalArgumentException ignored) { pulse("error", 0); }
        }

        private void pulse(String kind, int position) {
            if (token == null || !context.hasActiveReactInstance()) return;
            WritableMap event = Arguments.createMap();
            event.putString("token", token);
            event.putString("kind", kind);
            event.putInt("position", position);
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("camhomePlayback", event);
        }
    }
}
