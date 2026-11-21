import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import { Button, Empty, colors, styles } from "../components/ui";
import { useConnection } from "../hooks/useConnection";

export function Live({
  camera,
  onSettings,
}: {
  camera: Camera;
  onSettings: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const connection = useConnection(camera, attempt);
  return (
    <>
      <View style={visuals.player}>
        {connection.status === "connecting" ? (
          <ActivityIndicator color={colors.blue} />
        ) : (
          <Empty
            icon="videocam-off-outline"
            title="Chưa có video trực tiếp"
            detail={connection.message ?? "Chưa nhận được luồng video."}
          />
        )}
      </View>
      {connection.status === "error" && (
        <Button
          label="Thử kết nối lại"
          icon="refresh-outline"
          onPress={() => setAttempt(attempt + 1)}
        />
      )}
      <View style={visuals.bottom}>
        <Button
          label="Cài đặt camera"
          icon="settings-outline"
          onPress={onSettings}
        />
      </View>
    </>
  );
}

export function Library({
  tab,
  select,
}: {
  tab: "events" | "storage";
  select: (tab: "events" | "storage") => void;
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button
            label="Sự kiện"
            icon="notifications-outline"
            primary={tab === "events"}
            onPress={() => select("events")}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Lưu trữ"
            icon="folder-open-outline"
            primary={tab === "storage"}
            onPress={() => select("storage")}
          />
        </View>
      </View>
      <View style={visuals.player}>
        <Empty
          icon={tab === "events" ? "notifications-outline" : "film-outline"}
          title={tab === "events" ? "Chưa có sự kiện" : "Chưa có bản ghi"}
          detail="Dữ liệu sẽ xuất hiện khi có camera tương thích cung cấp dữ liệu."
        />
      </View>
    </>
  );
}

const visuals = StyleSheet.create({
  player: {
    minHeight: 200,
    borderRadius: 24,
    backgroundColor: "#E1EAFE",
    justifyContent: "center",
    borderColor: "#F8FBFF",
    borderWidth: 2,
    padding: 8,
  },
  bottom: { marginTop: "auto" },
});
