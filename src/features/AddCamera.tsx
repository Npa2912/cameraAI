import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Text, TextInput } from "react-native";
import { adapter } from "../adapters/UnverifiedAdapter";
import { Button, Card, styles } from "../components/ui";
import {
  DuplicateDeviceError,
  parseAddress,
  readLabel,
} from "../services/deviceInput";
import { messageFor } from "../services/connection";

export function AddCamera({
  onSave,
}: {
  onSave: (
    address: string | undefined,
    label: string | undefined,
  ) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [label, setLabel] = useState<string>();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setScanning(false);
    });
    return () => subscription.remove();
  }, []);

  async function scan() {
    if (!permission?.canAskAgain && permission && !permission.granted) {
      await Linking.openSettings();
      return;
    }
    const result = permission?.granted ? permission : await requestPermission();
    if (result.granted) {
      locked.current = false;
      setScanning(true);
      setMessage("");
    } else {
      setMessage("Cần quyền camera của điện thoại để quét mã QR.");
    }
  }

  async function discover() {
    try {
      const cameras = await adapter.discover(new AbortController().signal);
      setMessage(
        cameras.length ? "Đã tìm thấy thiết bị." : "Không tìm thấy camera.",
      );
    } catch (error) {
      setMessage("Tìm trong LAN: " + messageFor(error));
    }
  }

  async function save() {
    const parsed = parseAddress(address);
    if (address.trim() && !parsed) {
      setMessage("Nhập địa chỉ IPv4 hợp lệ của camera.");
      return;
    }
    if (!parsed && !label) {
      setMessage("Hãy quét QR hoặc nhập địa chỉ IP.");
      return;
    }
    setBusy(true);
    try {
      await onSave(parsed, label);
    } catch (error) {
      setMessage(
        error instanceof DuplicateDeviceError
          ? error.message
          : "Không lưu được thiết bị. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <Text style={styles.title}>Quét QR trên camera</Text>
        <Text style={styles.description}>
          {label
            ? "Đã đọc mã QR của thiết bị. Chưa ghép nối camera."
            : "Hướng camera điện thoại vào mã trên thân thiết bị."}
        </Text>
        {scanning ? (
          <>
            <CameraView
              style={{ height: 240, borderRadius: 16, overflow: "hidden" }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onMountError={() => {
                setScanning(false);
                setMessage("Không mở được camera của điện thoại.");
              }}
              onBarcodeScanned={({ data }) => {
                if (locked.current) return;
                locked.current = true;
                setScanning(false);
                const scanned = readLabel(data);
                setLabel(scanned);
                setMessage(scanned ? "" : "Không đọc được mã QR hợp lệ.");
              }}
            />
            <Button
              label="Dừng quét"
              icon="close-outline"
              onPress={() => setScanning(false)}
            />
          </>
        ) : (
          <Button
            label={
              permission && !permission.granted && !permission.canAskAgain
                ? "Mở cài đặt quyền"
                : "Quét QR"
            }
            icon="qr-code-outline"
            onPress={() =>
              void scan().catch(() => setMessage("Không mở được quyền camera."))
            }
          />
        )}
      </Card>
      <Card>
        <Text style={styles.title}>Mạng nội bộ</Text>
        <Button
          label="Tìm trong LAN"
          icon="wifi-outline"
          onPress={() => void discover()}
        />
        <Text style={styles.description}>
          Nhập địa chỉ IP nếu bạn biết địa chỉ từ bộ định tuyến.
        </Text>
        <TextInput
          accessibilityLabel="Địa chỉ IPv4"
          style={styles.input}
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoCapitalize="none"
          value={address}
          onChangeText={setAddress}
          placeholder="Địa chỉ IPv4"
          placeholderTextColor="#647797"
        />
      </Card>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {message}
        </Text>
      )}
      {busy ? (
        <Text style={styles.description}>Đang lưu…</Text>
      ) : (
        <Button
          label="Lưu thiết bị"
          icon="add-outline"
          primary
          onPress={() => void save()}
        />
      )}
    </>
  );
}
