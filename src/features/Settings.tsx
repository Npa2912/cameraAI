import { useState } from "react";
import { Alert, Linking, Text, TextInput } from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import { Button, Card, styles } from "../components/ui";

export function Settings({
  camera,
  rename,
  remove,
}: {
  camera?: Camera;
  rename: (name: string) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [name, setName] = useState(camera?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function write(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch {
      setMessage("Không lưu được thay đổi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {camera && (
        <Card>
          <Text style={styles.title}>Thông tin camera</Text>
          <Text style={styles.description}>
            Model · {camera.model ?? "Chưa xác minh"}
          </Text>
          <Text style={styles.description}>
            Firmware · {camera.firmware ?? "Chưa xác minh"}
          </Text>
          <Text style={styles.description}>
            Địa chỉ IP · {camera.address ?? "Chưa nhập"}
          </Text>
          <Text style={styles.title}>Tên camera</Text>
          <TextInput
            accessibilityLabel="Tên camera"
            style={styles.input}
            editable={!busy}
            value={name}
            onChangeText={setName}
            maxLength={64}
          />
          {!busy && !!name.trim() && name.trim() !== camera.name && (
            <Button
              label="Lưu tên"
              icon="checkmark-outline"
              primary
              onPress={() => void write(() => rename(name.trim()))}
            />
          )}
        </Card>
      )}
      <Card>
        <Text style={styles.title}>Quyền ứng dụng</Text>
        <Text style={styles.description}>
          Quyền camera điện thoại dùng để quét QR. Micro và thông báo chưa được
          yêu cầu.
        </Text>
        <Button
          label="Mở cài đặt Android"
          icon="settings-outline"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              setMessage("Không mở được cài đặt Android."),
            )
          }
        />
      </Card>
      {camera && !busy && (
        <Button
          label="Xóa camera"
          icon="trash-outline"
          onPress={() =>
            Alert.alert("Xóa camera?", "Thiết bị sẽ được xóa khỏi CamHome.", [
              { text: "Hủy", style: "cancel" },
              {
                text: "Xóa",
                style: "destructive",
                onPress: () => void write(remove),
              },
            ])
          }
        />
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {message}
        </Text>
      )}
    </>
  );
}
