package com.camhome.cameraai;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.*;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PhoneMediaModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext context;
    private final ExecutorService disk = Executors.newSingleThreadExecutor();

    public PhoneMediaModule(ReactApplicationContext context) {
        super(context);
        this.context = context;
    }

    public static final class Provider extends FileProvider { }

    public static final class Package implements com.facebook.react.ReactPackage {
        @Override public java.util.List<NativeModule> createNativeModules(ReactApplicationContext context) {
            return java.util.Collections.singletonList(new PhoneMediaModule(context));
        }

        @Override public java.util.List<com.facebook.react.uimanager.ViewManager> createViewManagers(ReactApplicationContext context) {
            return java.util.Collections.emptyList();
        }
    }

    @Override public String getName() { return "CamHomePhoneMedia"; }

    private boolean isPhoto(File file) {
        return file.isFile() && file.getName().matches("yiq6-[0-9]+\\.jpg");
    }

    private File photo(String name) throws IOException {
        if (!name.matches("yiq6-[0-9]+\\.jpg")) throw new IOException();
        File file = new File(context.getFilesDir(), name);
        if (!isPhoto(file)) throw new IOException();
        return file;
    }

    private interface Action { Object run() throws IOException; }

    private void run(Promise promise, Action action) {
        disk.execute(() -> {
            try { promise.resolve(action.run()); }
            catch (IOException | RuntimeException ignored) {
                promise.reject("media", "Could not complete photo operation.");
            }
        });
    }

    @ReactMethod public void listPhotos(Promise promise) {
        run(promise, () -> {
            File[] files = context.getFilesDir().listFiles(this::isPhoto);
            WritableArray items = Arguments.createArray();
            if (files == null) return items;
            Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
            for (File file : files) {
                WritableMap item = Arguments.createMap();
                item.putString("name", file.getName());
                item.putString("uri", Uri.fromFile(file).toString());
                item.putDouble("bytes", file.length());
                item.putDouble("createdAt", file.lastModified());
                items.pushMap(item);
            }
            return items;
        });
    }

    @ReactMethod public void sharePhoto(String name, Promise promise) {
        run(promise, () -> {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".photos", photo(name));
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType("image/jpeg")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return null;
        });
    }

    @ReactMethod public void downloadPhoto(String name, Promise promise) {
        run(promise, () -> {
            if (Build.VERSION.SDK_INT < 29) throw new IOException();
            File file = photo(name);
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, file.getName());
            values.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/CamHome");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            android.content.ContentResolver resolver = context.getContentResolver();
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException();
            try {
                try (OutputStream output = resolver.openOutputStream(uri)) {
                    if (output == null) throw new IOException();
                    Files.copy(file.toPath(), output);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                if (resolver.update(uri, values, null, null) == 0) throw new IOException();
            } catch (IOException | RuntimeException failure) {
                resolver.delete(uri, null, null);
                throw failure;
            }
            return null;
        });
    }

    @ReactMethod public void deletePhotos(ReadableArray names, Promise promise) {
        String[] selected = new String[names.size()];
        for (int i = 0; i < selected.length; i++) selected[i] = names.getString(i);
        run(promise, () -> {
            File[] files = new File[selected.length];
            for (int i = 0; i < files.length; i++) files[i] = photo(selected[i]);
            for (File file : files) if (!file.delete()) throw new IOException();
            return null;
        });
    }

    @ReactMethod public void landscape(boolean enabled, Promise promise) {
        Activity activity = context.getCurrentActivity();
        if (activity == null) {
            promise.reject("activity", "CamHome has no active window.");
            return;
        }
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(enabled ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            promise.resolve(null);
        });
    }

    @Override public void invalidate() {
        disk.shutdownNow();
        super.invalidate();
    }
}
