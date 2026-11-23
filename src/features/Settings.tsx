import { useState } from "react";
import { Alert, Linking, Text, TextInput } from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import { bridgeOrigin } from "../adapters/Yiq6Preview";
import { Button, Card, styles } from "../components/ui";

import { MenuRow } from "./MediaScreens";

export function Settings({
  camera,
  online,
  rename,
  remove,
  configureBridge,
}: {
  camera?: Camera;
  online?: boolean;
  rename: (name: string) => Promise<void>;
  remove: () => Promise<void>;
  configureBridge?: (address: string, code: string) => Promise<void>;
}) {
  const [name, setName] = useState(camera?.name ?? "");
  const [bridge, setBridge] = useState(camera?.bridge ?? "");
  const [code, setCode] = useState("");
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
          <MenuRow
            icon="videocam-outline"
            label={camera.name}
            detail={
              online === undefined
                ? "Trạng thái chưa xác minh"
                : online
                  ? "Online"
                  : "Offline"
            }
          />
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
      {camera?.driver && (
        <Card>
          <MenuRow
            icon="image-outline"
            label="Chất lượng hình ảnh"
            detail="Cố định theo luồng camera hiện tại"
          />
          <MenuRow
            icon="volume-medium-outline"
            label="Âm thanh và đàm thoại"
            detail="Chưa xác minh"
          />
          <MenuRow
            icon="notifications-outline"
            label="Cảnh báo chuyển động"
            detail="Chưa nhận sự kiện qua TNP"
          />
          <MenuRow
            icon="save-outline"
            label="Ghi hình và thẻ nhớ"
            detail="Chưa hỗ trợ"
          />
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
      {camera?.address && !camera.driver && configureBridge && (
        <Card>
          <Text style={styles.title}>YIQ6 qua bridge Windows</Text>
          <TextInput
            accessibilityLabel="Địa chỉ bridge"
            placeholder="IP Windows:cổng"
            style={styles.input}
            value={bridge}
            onChangeText={setBridge}
            editable={!busy}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TextInput
            accessibilityLabel="Mã truy cập bridge"
            placeholder="Mã truy cập bridge"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            editable={!busy}
            autoCapitalize="none"
            secureTextEntry
          />
          {!busy && (
            <Button
              label="Lưu bridge YIQ6"
              onPress={() => {
                if (
                  !bridgeOrigin(bridge) ||
                  !/^[A-Za-z0-9_-]{32}$/.test(code.trim())
                ) {
                  setMessage(
                    "Nhập IP LAN, cổng và mã truy cập do bridge cung cấp.",
                  );
                  return;
                }
                void write(async () => {
                  await configureBridge(bridge.trim(), code.trim());
                  setCode("");
                  setMessage("Đã lưu cấu hình bridge.");
                });
              }}
            />
          )}
        </Card>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {message}
        </Text>
      )}
    </>
  );
}
