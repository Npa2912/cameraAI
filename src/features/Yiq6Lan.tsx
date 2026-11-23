import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Image,
  Text,
  TextInput,
  View,
  UIManager,
  findNodeHandle,
  requireNativeComponent,
  type ViewProps,
} from "react-native";
import { randomUUID } from "expo-crypto";
import { yiq6, lanError } from "../adapters/Yiq6Lan";
import type { Camera } from "../adapters/CameraAdapter";
import {
  Button,
  Card,
  Glyph,
  IconButton,
  colors,
  styles,
} from "../components/ui";
import { loadYiq6Key } from "../storage/devices";

import { phoneMedia } from "../storage/phoneMedia";
import { MenuRow } from "./MediaScreens";

type Stream = { viewer: string; address: string; uid: string; key: string };
const NativeVideo = yiq6
  ? requireNativeComponent<ViewProps & { stream: Stream }>("CamHomeYiq6Video")
  : undefined;

type Pairing = { address: string; uid: string; key: string; name: string };
type Status =
  | "online"
  | "offline"
  | "connecting"
  | "auth"
  | "auth_result"
  | "input"
  | "discovery_timeout"
  | "handshake_timeout"
  | "auth_timeout"
  | "protocol";
const statuses: Record<Status, string> = {
  online: "Online",
  offline: "Offline · Đang kết nối lại",
  connecting: "Đang kết nối qua LAN",
  auth: lanError({ code: "auth" }),
  auth_result: lanError({ code: "auth_result" }),
  input: lanError({ code: "input" }),
  discovery_timeout: lanError({ code: "discovery_timeout" }),
  handshake_timeout: lanError({ code: "handshake_timeout" }),
  auth_timeout: lanError({ code: "auth_timeout" }),
  protocol: lanError({ code: "protocol" }),
};

export function AddYiq6Lan({
  onSave,
  legacy,
}: {
  legacy: (mode: "qr" | "manual") => void;
  onSave: (pairing: Pairing) => Promise<void>;
}) {
  const [found, setFound] = useState<
    Awaited<ReturnType<NonNullable<typeof yiq6>["discover"]>>
  >([]);
  const [mode, setMode] = useState<"menu" | "scan" | "pair">("menu");
  const [visible, setVisible] = useState(false);
  const [address, setAddress] = useState("");
  const [uid, setUid] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  if (!yiq6) return null;
  const adapter = yiq6;
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(lanError(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function scan() {
    setMode("scan");
    setFound([]);
    void run(async () => {
      const cameras = await adapter.discover();
      setFound(cameras);
      if (!cameras.length)
        setMessage("Không thấy thiết bị. Kiểm tra Wi-Fi hoặc nhập IP.");
    });
  }

  if (mode === "menu")
    return (
      <Card>
        <MenuRow
          icon="search-outline"
          label="Tự tìm camera trong LAN"
          detail="Tìm thiết bị TNP cùng Wi-Fi"
          onPress={scan}
        />
        <MenuRow
          icon="create-outline"
          label="Nhập thủ công"
          detail="Nhập IP và khóa TNP"
          onPress={() => setMode("pair")}
        />
        <MenuRow
          icon="qr-code-outline"
          label="Quét mã QR"
          detail="Lưu nhãn trên thân thiết bị"
          onPress={() => legacy("qr")}
        />
        <MenuRow
          icon="document-outline"
          label="Nhập hồ sơ"
          detail="Chưa hỗ trợ nhập tệp"
        />
      </Card>
    );

  if (mode === "scan")
    return (
      <>
        <View style={visual.scan}>
          <Text style={styles.title}>
            {busy ? "Đang tìm camera…" : "Thiết bị trong LAN"}
          </Text>
          <View style={visual.radar}>
            <View style={visual.radarInner}>
              <View style={visual.radarCore}>
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Glyph name="scan-outline" color="white" size={24} />
                )}
              </View>
            </View>
          </View>
          <Text style={styles.description} accessibilityLiveRegion="polite">
            {busy
              ? "Đang quét thiết bị TNP trong mạng LAN."
              : message || `Tìm thấy ${found.length} thiết bị TNP.`}
          </Text>
        </View>
        {found.map((item) => (
          <Card key={item.uid}>
            <MenuRow
              icon="videocam-outline"
              label={item.address}
              detail="Thiết bị TNP · Đã phản hồi"
              onPress={() => {
                setAddress(item.address);
                setUid(item.uid);
                setMode("pair");
                setMessage("");
              }}
            />
          </Card>
        ))}
        <Button
          label="Tìm lại"
          icon="refresh-outline"
          disabled={busy}
          onPress={scan}
        />
        <Button
          label="Nhập IP thủ công"
          disabled={busy}
          onPress={() => {
            setMode("pair");
            setMessage("");
          }}
        />
      </>
    );

  return (
    <Card>
      <View style={visual.pairBadge}>
        <Glyph name="videocam" size={32} />
      </View>
      <Text style={[styles.title, { textAlign: "center" }]}>
        Thêm camera (YI06)
      </Text>
      <Text style={styles.title}>Tên camera</Text>
      <TextInput
        accessibilityLabel="Tên camera"
        style={styles.input}
        placeholder="YI06"
        value={name}
        onChangeText={setName}
        maxLength={64}
        editable={!busy}
      />
      <Text style={styles.title}>Địa chỉ IP</Text>
      <TextInput
        accessibilityLabel="Địa chỉ IP camera"
        style={styles.input}
        placeholder="Địa chỉ IPv4"
        value={address}
        onChangeText={(value) => {
          setAddress(value);
          setUid("");
        }}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      <Text style={styles.title}>Khóa TNP (15 byte)</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Khóa TNP"
          style={[styles.input, styles.flex]}
          placeholder="Khóa TNP"
          value={key}
          onChangeText={setKey}
          secureTextEntry={!visible}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          editable={!busy}
        />
        <IconButton
          label={visible ? "Ẩn khóa" : "Hiện khóa"}
          icon={visible ? "eye-off-outline" : "eye-outline"}
          onPress={() => setVisible(!visible)}
        />
      </View>
      <MenuRow
        icon="shield-checkmark-outline"
        label="Android Keystore"
        detail="Khóa được lưu sau khi camera xác thực."
      />
      <Button
        label={busy ? "Đang xác thực…" : "Xác thực và lưu YI06"}
        primary
        disabled={busy || !address.trim() || !key}
        onPress={() =>
          void run(async () => {
            const ip = address.trim();
            const verifiedUid = await adapter.verify(ip, uid, key);
            try {
              await onSave({
                address: ip,
                uid: verifiedUid,
                key,
                name: name.trim() || "YI06",
              });
            } catch (error) {
              setMessage(
                error instanceof Error && error.name === "DuplicateDeviceError"
                  ? "Camera đã có trong danh sách."
                  : "Không lưu được camera.",
              );
              return;
            }
            setKey("");
          })
        }
      />
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {message}
        </Text>
      ) : null}
    </Card>
  );
}

export function Yiq6LanLive({
  camera,
  onSettings,
  onStatus,
  onSnapshot,
  fullscreen,
  onFullscreen,
}: {
  camera: Camera;
  onSettings: () => void;
  onStatus: (status: Status) => void;
  onSnapshot: (id: string, uri: string) => void;
  fullscreen: boolean;
  onFullscreen: (value: boolean) => void;
}) {
  const [stream, setStream] = useState<Stream>();
  const [status, setStatus] = useState<Status>("connecting");
  const [recording, setRecording] = useState("stopped");
  const isRecording = recording === "active" || recording === "waiting";
  const [snapshot, setSnapshot] = useState("");
  const [message, setMessage] = useState("");
  const { width, height } = useWindowDimensions();
  const rotated = useRef(false);
  useEffect(
    () => () => {
      if (rotated.current)
        void phoneMedia?.landscape(false).catch(() => undefined);
    },
    [],
  );
  function toggleFullscreen() {
    const next = !fullscreen;
    rotated.current = next;
    onFullscreen(next);
    void phoneMedia?.landscape(next).catch(() => undefined);
  }

  const video = useRef<ComponentRef<NonNullable<typeof NativeVideo>>>(null);

  useEffect(() => {
    const id = randomUUID();
    let active = true;
    const listener = DeviceEventEmitter.addListener(
      "camhomeYiq6",
      (event: { viewer: string; kind: string; value: string }) => {
        if (event.viewer !== id) return;
        if (event.kind === "status") {
          const next = event.value as Status;
          setStatus(next);
          onStatus(next);
        }
        if (event.kind === "recording") setRecording(event.value);
        if (event.kind === "snapshot") {
          setSnapshot(event.value);
          onSnapshot(camera.id, event.value);
          setMessage("Đã lưu ảnh trên điện thoại.");
        }
        if (event.kind === "snapshotError") setMessage("Không lưu được ảnh.");
      },
    );
    if (NativeVideo && camera.address && camera.tnpUid) {
      void loadYiq6Key(camera.id)
        .then((secret) => {
          if (!active) return;
          if (secret && camera.address && camera.tnpUid)
            setStream({
              viewer: id,
              address: camera.address,
              uid: camera.tnpUid,
              key: secret,
            });
          else
            setMessage("Thiếu khóa TNP. Hãy thêm lại camera với khóa hợp lệ.");
        })
        .catch(() => {
          if (active) setMessage("Không đọc được khóa đã lưu.");
        });
    } else setMessage("Cần bản Android có driver YI06.");
    return () => {
      active = false;
      listener.remove();
    };
  }, [camera.id, camera.address, camera.tnpUid, onStatus, onSnapshot]);

  function command(name: string, args: (number | string)[] = []) {
    const handle = findNodeHandle(video.current);
    if (handle != null)
      UIManager.dispatchViewManagerCommand(handle, name, args);
  }

  return (
    <View style={[visual.live, fullscreen && visual.liveFull]}>
      <View
        style={[
          visual.player,
          fullscreen && {
            width: Math.max(1, Math.min(width, ((height - 75) * 16) / 9)),
          },
        ]}
      >
        <View style={visual.playerStatus}>
          <View
            style={[
              visual.dot,
              status === "online" && { backgroundColor: "#29C889" },
            ]}
          />
          <Text accessibilityLiveRegion="polite" style={visual.playerText}>
            {status === "online" ? "Trực tiếp" : statuses[status]}
          </Text>
        </View>
        <View style={visual.video}>
          {NativeVideo && stream && (
            <NativeVideo
              ref={video}
              stream={stream}
              style={StyleSheet.absoluteFill}
            />
          )}
          {status !== "online" && (
            <View pointerEvents="none" style={visual.videoEmpty}>
              <Glyph name="videocam-outline" color="#C0B9DD" size={36} />
            </View>
          )}
        </View>
        <View style={visual.playerFooter}>
          <Text style={visual.playerText}>TNP · H.264</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"
            }
            style={visual.control}
            onPress={toggleFullscreen}
          >
            <Glyph
              name={fullscreen ? "contract-outline" : "expand-outline"}
              color="white"
              size={23}
            />
          </Pressable>
        </View>
      </View>
      {!fullscreen && (
        <>
          <View style={visual.actions}>
            <Button
              label="Chụp ảnh"
              icon="camera-outline"
              disabled={status !== "online"}
              onPress={() => command("snapshot")}
            />
            <Button
              label={isRecording ? "Dừng ghi" : "Ghi video"}
              icon="recording-outline"
              disabled={
                recording === "finalizing" ||
                (status !== "online" && !isRecording)
              }
              onPress={() => {
                if (isRecording) {
                  setRecording("finalizing");
                  command("recordStop");
                } else command("recordStart", [camera.id]);
              }}
            />
            <Button
              label="Cài đặt camera"
              icon="settings-outline"
              onPress={onSettings}
            />
          </View>
          {recording !== "stopped" && (
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              {recording === "active"
                ? "Đang ghi MP4 trên điện thoại."
                : recording === "waiting"
                  ? "Đang chờ khung hình để ghi."
                  : recording === "finalizing"
                    ? "Đang hoàn tất đoạn ghi hình."
                    : "Ghi hình bị gián đoạn. Kiểm tra dung lượng điện thoại."}
            </Text>
          )}
          <Card>
            <Text style={styles.title}>Điều khiển PTZ</Text>
            <View style={styles.row}>
              <View style={visual.dpad}>
                {(
                  [
                    ["Lên", "caret-up", visual.up],
                    ["Xuống", "caret-down", visual.down],
                    ["Trái", "caret-back", visual.left],
                    ["Phải", "caret-forward", visual.right],
                  ] as const
                ).map(([label, icon, position], index) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    disabled={status !== "online"}
                    accessibilityState={{ disabled: status !== "online" }}
                    onPress={() => command("move", [index + 1])}
                    style={[visual.direction, position]}
                  >
                    <Glyph
                      name={icon}
                      color={status === "online" ? colors.ink : colors.muted}
                      size={21}
                    />
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.description, styles.flex]}>
                Preset và tuần tra chưa được xác minh.
              </Text>
            </View>
          </Card>
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              {message}
            </Text>
          ) : null}
          {snapshot ? (
            <Image
              source={{ uri: snapshot }}
              accessibilityLabel="Ảnh đã chụp"
              style={visual.snapshot}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const visual = StyleSheet.create({
  pairBadge: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: "#ECE8FF",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  scan: { alignItems: "center", gap: 16, paddingVertical: 22 },
  radar: {
    width: 154,
    height: 154,
    borderRadius: 77,
    backgroundColor: "#E8E4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  radarInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#D1C9FF",
    borderWidth: 1,
    borderColor: "#F5F2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  radarCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  live: { gap: 14 },
  liveFull: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.dark,
  },
  player: {
    overflow: "hidden",
    backgroundColor: colors.dark,
    borderRadius: 18,
  },
  playerStatus: {
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
  },
  playerText: {
    color: "white",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#A8A2BC" },
  video: { aspectRatio: 16 / 9, backgroundColor: "#161820" },
  videoEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playerFooter: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  control: {
    minWidth: 48,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dpad: {
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: "#EDEAFF",
    borderWidth: 1,
    borderColor: "#DFDAF6",
  },
  direction: {
    position: "absolute",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  up: { top: 0, left: 46 },
  down: { bottom: 0, left: 46 },
  left: { left: 0, top: 46 },
  right: { right: 0, top: 46 },
  snapshot: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14 },
});
