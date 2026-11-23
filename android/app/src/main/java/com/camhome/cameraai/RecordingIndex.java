package com.camhome.cameraai;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import java.io.File;

final class RecordingIndex extends SQLiteOpenHelper {
    private final File directory;
    RecordingIndex(Context context) {
        super(context, "camhome-recordings.db", null, 1);
        directory = new File(context.getFilesDir(), "recordings");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE recordings (id TEXT PRIMARY KEY, camera_id TEXT NOT NULL, "
            + "start_ms INTEGER NOT NULL, end_ms INTEGER, width INTEGER, height INTEGER, "
            + "size INTEGER, checksum TEXT, frame_count INTEGER, state TEXT NOT NULL, "
            + "drive_file_id TEXT, upload_state TEXT NOT NULL DEFAULT 'local', protected INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX recordings_camera_time ON recordings(camera_id, start_ms)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Missing recording migration");
    }

    File file(String id, boolean partial) {
        if (!id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Invalid recording ID");
        return new File(directory, id + (partial ? ".partial" : ".mp4"));
    }

    File directory() { return directory; }

    void begin(String id, String camera, long start, int width, int height) {
        ContentValues row = new ContentValues();
        row.put("id", id);
        row.put("camera_id", camera);
        row.put("start_ms", start);
        row.put("width", width);
        row.put("height", height);
        row.put("state", "writing");
        getWritableDatabase().insertOrThrow("recordings", null, row);
    }

    void prepared(String id, long end, long size, String hash, int frames) {
        ContentValues row = new ContentValues();
        row.put("state", "prepared");
        row.put("end_ms", end);
        row.put("size", size);
        row.put("checksum", hash);
        row.put("frame_count", frames);
        getWritableDatabase().update("recordings", row, "id = ?", new String[]{id});
    }

    void state(String id, String value) {
        ContentValues row = new ContentValues();
        row.put("state", value);
        getWritableDatabase().update("recordings", row, "id = ?", new String[]{id});
    }

    void recover() {
        try (Cursor rows = getReadableDatabase().query("recordings", new String[]{"id", "state", "size"},
                 "state IN ('writing','prepared')", null, null, null, null)) {
            while (rows.moveToNext()) {
                String id = rows.getString(0);
                File partial = file(id, true);
                File complete = file(id, false);
                if ("prepared".equals(rows.getString(1))) {
                    if (!complete.exists() && partial.length() == rows.getLong(2)) partial.renameTo(complete);
                    if (complete.isFile() && complete.length() == rows.getLong(2)) {
                        state(id, "ready");
                        continue;
                    }
                }
                state(id, "interrupted");
                if (partial.exists()) partial.delete();
            }
        }
    }

    WritableArray list(String camera) {
        WritableArray result = Arguments.createArray();
        try (Cursor rows = getReadableDatabase().query("recordings",
                new String[]{"id", "start_ms", "end_ms", "width", "height", "size", "checksum", "frame_count"},
                "camera_id = ? AND state = 'ready'", new String[]{camera}, null, null, "start_ms ASC")) {
            while (rows.moveToNext()) {
                String id = rows.getString(0);
                File video = file(id, false);
                if (!video.isFile() || video.length() != rows.getLong(5)) continue;
                WritableMap segment = Arguments.createMap();
                segment.putString("id", id);
                segment.putString("uri", Uri.fromFile(video).toString());
                segment.putDouble("startMs", rows.getLong(1));
                segment.putDouble("endMs", rows.getLong(2));
                segment.putInt("width", rows.getInt(3));
                segment.putInt("height", rows.getInt(4));
                segment.putDouble("size", rows.getLong(5));
                segment.putString("checksum", rows.getString(6));
                segment.putDouble("fps", rows.getInt(7) * 1000.0 / Math.max(1, rows.getLong(2) - rows.getLong(1)));
                result.pushMap(segment);
            }
        }
        return result;
    }
}
