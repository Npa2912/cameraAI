import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { AppState, Image, Text } from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import {
  BridgeAccessError,
  bridgeRequest,
  type PreviewFrame,
  type PtzDirection,
} from "../adapters/Yiq6Preview";
import { Button, Card, styles } from "../components/ui";
import { loadBridge } from "../storage/devices";

const statusText = {
  offline: "Offline",
  online: "Online",
  connecting: "Connecting",
  error: "Error",
};

export function Yiq6Live({
  camera,
  onSettings,
}: {
  camera: Camera;
  onSettings: () => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background",
  );
  const [frame, setFrame] = useState<PreviewFrame>({ status: "connecting" });
  const [snapshot, setSnapshot] = useState("");
  const [capture, setCapture] = useState<() => void>();
  const [move, setMove] = useState<(direction: PtzDirection) => void>();
  const [displayed, setDisplayed] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !foreground || !camera.bridge) return;
    const address = camera.bridge;
    const viewer = randomUUID();
    const control = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let code: string | null = null;
    let sequence: number | undefined;
    setFrame({ status: "connecting" });
    setDisplayed(false);
    setSnapshot("");
    async function poll() {
      try {
        code ??= await loadBridge(camera.id);
        if (control.signal.aborted) return;
        if (!code) throw new BridgeAccessError();
        const next = await bridgeRequest<PreviewFrame>(
          address,
          code,
          viewer,
          "frame",
          sequence,
          control.signal,
        );
        if (control.signal.aborted) return;
        sequence =
          next.sequence ?? (next.status === "online" ? sequence : undefined);
        if (next.status !== "online") setDisplayed(false);
        setFrame((previous) => ({
          ...next,
          image:
            next.status === "online"
              ? (next.image ?? previous.image)
              : undefined,
        }));
        timer = setTimeout(poll, next.status === "online" ? 80 : 350);
      } catch (error) {
        if (control.signal.aborted) return;
        sequence = undefined;
        setDisplayed(false);
        if (error instanceof BridgeAccessError) {
          setFrame({
            status: "error",
            message: "Kiểm tra mã truy cập bridge trong cài đặt camera.",
          });
        } else {
          setFrame({
            status: "offline",
            message: "Mất kết nối với bridge. Đang thử lại.",
          });
          timer = setTimeout(poll, 1200);
        }
      }
    }
    setCapture(() => async () => {
      if (!code) return;
      try {
        const result = await bridgeRequest<{ name: string }>(
          address,
          code,
          viewer,
          "snapshot",
          undefined,
          control.signal,
        );
        if (!control.signal.aborted)
          setSnapshot("Đã lưu trên Windows · " + result.name);
      } catch {
        if (!control.signal.aborted)
          setSnapshot("Không lưu được ảnh. Vui lòng thử lại.");
      }
    });
    setMove(() => async (direction: PtzDirection) => {
      if (!code || control.signal.aborted) return;
      try {
        await bridgeRequest(
          address,
          code,
          viewer,
          "move",
          undefined,
          control.signal,
          direction,
        );
      } catch {
        if (!control.signal.aborted)
          setSnapshot("Bridge chưa nhận lệnh xoay. Vui lòng thử lại.");
      }
    });
    void poll();
    return () => {
      control.abort();
      clearTimeout(timer);
      if (code)
        void bridgeRequest(address, code, viewer, "disconnect").catch(
          () => undefined,
        );
    };
  }, [camera.bridge, camera.id, enabled, foreground]);

  const active = enabled && foreground;
  const image = active ? frame.image : undefined;
  const status = !active
    ? "offline"
    : frame.status === "online" && !displayed
      ? "connecting"
      : frame.status;
  return (
    <>
      <Card>
        <Text accessibilityLiveRegion="polite" style={styles.title}>
          {statusText[status]}
        </Text>
        {image && (
          <Image
            accessibilityLabel="Video YIQ6"
            source={{ uri: "data:image/jpeg;base64," + image }}
            style={{
              width: "100%",
              aspectRatio: (frame.width ?? 16) / (frame.height ?? 9),
            }}
            resizeMode="contain"
            onLoad={() => setDisplayed(true)}
          />
        )}
        {status === "online" && (
          <Text style={styles.description}>
            {frame.width} × {frame.height}
            {frame.fps ? " · " + frame.fps + " FPS nguồn" : ""}
          </Text>
        )}
        {active && frame.message && (
          <Text style={styles.description}>{frame.message}</Text>
        )}
        {status === "online" && (
          <Button
            label="Chụp ảnh"
            icon="camera-outline"
            onPress={() => capture?.()}
          />
        )}
        {status === "online" &&
          frame.ptz &&
          (
            [
              ["up", "Lên"],
              ["down", "Xuống"],
              ["left", "Trái"],
              ["right", "Phải"],
            ] as const
          ).map(([direction, label]) => (
            <Button
              key={direction}
              label={label}
              onPress={() => move?.(direction)}
            />
          ))}
        {active && snapshot && (
          <Text style={styles.description}>{snapshot}</Text>
        )}
      </Card>
      <Button
        label={enabled ? "Ngắt kết nối" : "Kết nối"}
        onPress={() => setEnabled(!enabled)}
      />
      <Button
        label="Cài đặt camera"
        icon="settings-outline"
        onPress={onSettings}
      />
    </>
  );
}
