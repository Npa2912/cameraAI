import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Camera } from "./adapters/CameraAdapter";
import {
  Button,
  Card,
  Glyph,
  IconButton,
  colors,
  styles,
  type Icon,
} from "./components/ui";
import { AddCamera } from "./features/AddCamera";
import { Live } from "./features/Live";
import { AddYiq6Lan, Yiq6LanLive } from "./features/Yiq6Lan";
import { yiq6 } from "./adapters/Yiq6Lan";
import { Yiq6Live } from "./features/Yiq6Live";
import { RecordingPlayback } from "./features/RecordingPlayback";
import { Settings } from "./features/Settings";
import { CameraBoard } from "./features/CameraBoard";
import { Account, Events, Photos, Storage } from "./features/MediaScreens";
import { phoneMedia, type Photo } from "./storage/phoneMedia";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadDevices,
  saveDevices,
  saveLabel,
  removeLabel,
  loadBridge,
  saveBridge,
  removeBridge,
  saveYiq6Key,
  removeYiq6Key,
} from "./storage/devices";

import { DuplicateDeviceError } from "./services/deviceInput";
import { useNavigation, type Tab } from "./navigation/useNavigation";

const tabs: { route: Tab; label: string; icon: Icon }[] = [
  { route: "home", label: "Trang chủ", icon: "home-outline" },
  { route: "events", label: "Sự kiện", icon: "notifications-outline" },
  { route: "storage", label: "Lưu trữ", icon: "folder-open-outline" },
  { route: "settings", label: "Tài khoản", icon: "person-outline" },
];

function CamHome() {
  const { route, setRoute, back } = useNavigation();
  const [selectedId, setSelectedId] = useState<string>();
  const [devices, setDevices] = useState<Camera[]>();
  const [loadError, setLoadError] = useState(false);
  const writing = useRef(false);
  const [grid, setGrid] = useState(false);
  const [multiGrid, setMultiGrid] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [full, setFull] = useState(false);
  const [legacyAdd, setLegacyAdd] = useState<"qr" | "manual">();
  useEffect(() => {
    if (route !== "add") setLegacyAdd(undefined);
  }, [route]);
  const refreshPhotos = useCallback(() => {
    void phoneMedia
      ?.listPhotos()
      .then(setPhotos)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (route === "storage" || route === "photos" || route === "home")
      refreshPhotos();
  }, [route, refreshPhotos]);
  useEffect(() => {
    void AsyncStorage.getItem("camhome.previews.v1")
      .then((value) => {
        if (value) setPreviews(JSON.parse(value));
      })
      .catch(() => undefined);
  }, []);
  const rememberPhoto = useCallback(
    (id: string, uri: string) => {
      setPreviews((previous) => {
        const next = { ...previous, [id]: uri };
        void AsyncStorage.setItem(
          "camhome.previews.v1",
          JSON.stringify(next),
        ).catch(() => undefined);
        return next;
      });
      refreshPhotos();
    },
    [refreshPhotos],
  );

  useEffect(() => {
    if (route !== "live") setFull(false);
  }, [route]);
  const selected = devices?.find((device) => device.id === selectedId);
  const [online, setOnline] = useState<Set<string>>();
  const hasYiq6 =
    devices?.some((device) => device.driver === "yiq6-lan") ?? false;
  useEffect(() => {
    if ((route !== "home" && route !== "multi") || !hasYiq6 || !yiq6) return;
    const driver = yiq6;
    let active = true;
    let running = false;
    let foreground = AppState.currentState !== "background";
    let timer: ReturnType<typeof setTimeout>;
    async function probe() {
      if (running || !active || !foreground) return;
      running = true;
      try {
        const found = await driver.discover();
        if (active && foreground)
          setOnline(new Set(found.map((camera) => camera.uid)));
      } catch {
        if (active) setOnline(undefined);
      } finally {
        running = false;
        if (active && foreground) timer = setTimeout(probe, 15000);
      }
    }
    const subscription = AppState.addEventListener("change", (state) => {
      clearTimeout(timer);
      foreground = state === "active";
      if (foreground) void probe();
    });
    void probe();
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [route, hasYiq6]);

  const updateStatus = useCallback(
    (status: string) => {
      if (!selected?.tnpUid || (status !== "online" && status !== "offline"))
        return;
      const id = selected.tnpUid;
      setOnline((previous) => {
        const next = new Set(previous);
        if (status === "online") next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [selected?.tnpUid],
  );

  const showTabs = tabs.some((tab) => tab.route === route);

  const reload = useCallback(async () => {
    setLoadError(false);
    try {
      setDevices(await loadDevices());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function persist(
    next: Camera[],
    label?: { id: string; value: string },
    pairing?: { id: string; key: string },
  ) {
    if (writing.current) throw new Error("Write already in progress");
    writing.current = true;
    try {
      if (label) await saveLabel(label.id, label.value);
      try {
        if (pairing) await saveYiq6Key(pairing.id, pairing.key);
        await saveDevices(next);
      } catch (error) {
        if (label) await removeLabel(label.id).catch(() => undefined);
        if (pairing) await removeYiq6Key(pairing.id).catch(() => undefined);
        throw error;
      }
      setDevices(next);
    } finally {
      writing.current = false;
    }
  }

  const titles = {
    home: "CamHome",
    add: "Thêm camera",
    live: selected?.name,
    deviceSettings: "Cài đặt camera",
    multi: "Nhiều camera",
    events: "Sự kiện",
    storage: "Lưu trữ",
    settings: "Tài khoản",
    playback: "Xem lại",
    photos: "Ảnh chụp",
  };
  const board = route === "home" || route === "multi";
  const nativeLive = route === "live" && selected?.driver === "yiq6-lan";
  const previewUris = new Set(photos.map((photo) => photo.uri));
  const visiblePreviews = Object.fromEntries(
    Object.entries(previews).filter(([, uri]) => previewUris.has(uri)),
  );

  return (
    <SafeAreaView
      style={[layout.screen, nativeLive && { backgroundColor: colors.dark }]}
    >
      <StatusBar
        barStyle={nativeLive ? "light-content" : "dark-content"}
        hidden={full}
      />
      {!full && (devices || route !== "home" || loadError) && (
        <View
          style={[
            layout.header,
            nativeLive && { backgroundColor: colors.dark },
          ]}
        >
          {route === "home" && (
            <View style={layout.logo}>
              <Glyph name="home" size={22} color="white" />
            </View>
          )}
          {!showTabs && (
            <IconButton label="Quay lại" icon="chevron-back" onPress={back} />
          )}
          <Text
            accessibilityRole="header"
            style={[
              styles.heading,
              styles.flex,
              nativeLive && { color: "white" },
            ]}
            numberOfLines={1}
          >
            {titles[route]}
          </Text>
          {route === "home" && (
            <>
              <IconButton
                label="Thông báo"
                icon="notifications-outline"
                onPress={() => setRoute("events")}
              />
              <IconButton
                label="Tài khoản"
                icon="person-outline"
                onPress={() => setRoute("settings")}
              />
            </>
          )}
        </View>
      )}
      {board &&
        (loadError ? (
          <View style={styles.page}>
            <Card>
              <Text style={styles.description}>
                Không đọc được danh sách thiết bị.
              </Text>
              <Button label="Tải lại" onPress={() => void reload()} />
            </Card>
          </View>
        ) : devices ? (
          <CameraBoard
            devices={devices}
            online={online}
            previews={visiblePreviews}
            grid={route === "multi" ? multiGrid : grid}
            multi={route === "multi"}
            toggleGrid={
              route === "multi"
                ? () => setMultiGrid((value) => !value)
                : () => setGrid((value) => !value)
            }
            navigate={setRoute}
            open={(camera) => {
              setSelectedId(camera.id);
              setRoute("live");
            }}
            configure={(camera) => {
              setSelectedId(camera.id);
              setRoute("deviceSettings");
            }}
          />
        ) : (
          <View style={layout.splash} accessibilityLabel="CamHome đang tải">
            <View style={layout.splashCamera}>
              <Glyph name="videocam" size={54} color={colors.blue} />
            </View>
            <Text style={layout.splashTitle}>CamHome</Text>
            <Text style={layout.splashText}>
              Giám sát an toàn, kết nối mọi nơi
            </Text>
          </View>
        ))}

      {route === "photos" && <Photos photos={photos} refresh={refreshPhotos} />}
      {!board && route !== "photos" && (
        <ScrollView
          key={route}
          style={styles.flex}
          contentContainerStyle={
            full
              ? layout.fullPage
              : [
                  styles.page,
                  nativeLive && { backgroundColor: colors.background },
                ]
          }
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!full}
        >
          {route === "add" && devices && yiq6 && !legacyAdd && (
            <AddYiq6Lan
              legacy={(mode) => setLegacyAdd(mode)}
              onSave={async ({ address, uid, key, name }) => {
                if (devices.some((device) => device.tnpUid === uid))
                  throw new DuplicateDeviceError(
                    "Camera đã có trong danh sách.",
                  );
                const existing = devices.find(
                  (device) => device.address === address && !device.driver,
                );
                const id = existing?.id ?? randomUUID();
                const direct: Camera = {
                  ...existing,
                  id,
                  name,
                  address,
                  model: "YI06",
                  driver: "yiq6-lan",
                  tnpUid: uid,
                };
                await persist(
                  existing
                    ? devices.map((device) =>
                        device.id === id ? direct : device,
                      )
                    : [...devices, direct],
                  undefined,
                  { id, key },
                );
                setRoute("home");
              }}
            />
          )}
          {route === "add" && devices && (!yiq6 || legacyAdd) && (
            <AddCamera
              onSave={async (address, label) => {
                if (
                  address &&
                  devices.some((device) => device.address === address)
                )
                  throw new DuplicateDeviceError(
                    "Địa chỉ IP đã có trong danh sách.",
                  );
                const id = randomUUID();
                await persist(
                  [...devices, { id, name: "Camera mới", address }],
                  label ? { id, value: label } : undefined,
                );
                setRoute("home");
              }}
            />
          )}
          {route === "live" && selected?.driver === "yiq6-lan" && (
            <Yiq6LanLive
              key={selected.id}
              camera={selected}
              onStatus={updateStatus}
              onSnapshot={rememberPhoto}
              fullscreen={full}
              onFullscreen={setFull}
              onSettings={() => setRoute("deviceSettings")}
            />
          )}
          {route === "live" && selected?.bridge && !selected.driver && (
            <Yiq6Live
              camera={selected}
              onSettings={() => setRoute("deviceSettings")}
            />
          )}
          {route === "live" &&
            selected &&
            !selected.bridge &&
            !selected.driver && (
              <Live
                camera={selected}
                onSettings={() => setRoute("deviceSettings")}
              />
            )}
          {route === "events" && <Events />}
          {route === "storage" && (
            <Storage
              photos={photos}
              navigate={setRoute}
              refresh={refreshPhotos}
            />
          )}
          {route === "playback" && (
            <RecordingPlayback cameras={devices ?? []} />
          )}
          {route === "settings" && <Account navigate={setRoute} />}
          {route === "deviceSettings" && (
            <Settings
              camera={selected}
              online={
                selected?.tnpUid && online
                  ? online.has(selected.tnpUid)
                  : undefined
              }
              rename={async (name) => {
                if (selected && devices)
                  await persist(
                    devices.map((device) =>
                      device.id === selected.id ? { ...device, name } : device,
                    ),
                  );
              }}
              configureBridge={async (bridge, code) => {
                if (!selected || !devices || selected.driver) return;
                const previous = await loadBridge(selected.id);
                await saveBridge(selected.id, code);
                try {
                  await persist(
                    devices.map((device) =>
                      device.id === selected.id
                        ? { ...device, model: "YIQ6", bridge }
                        : device,
                    ),
                  );
                } catch (error) {
                  if (previous) await saveBridge(selected.id, previous);
                  else await removeBridge(selected.id);
                  throw error;
                }
              }}
              remove={async () => {
                if (selected && devices) {
                  if (selected.bridge) await removeBridge(selected.id);
                  await removeLabel(selected.id);
                  await persist(
                    devices.filter((device) => device.id !== selected.id),
                  );
                  if (selected.driver === "yiq6-lan")
                    await removeYiq6Key(selected.id);
                }
                setSelectedId(undefined);
                setRoute("home");
              }}
            />
          )}
        </ScrollView>
      )}
      {showTabs && (devices || route !== "home" || loadError) && (
        <View style={layout.nav}>
          {tabs.flatMap((tab, index) => [
            ...(index === 2
              ? [
                  <Pressable
                    key="add"
                    accessibilityRole="button"
                    accessibilityLabel="Thêm camera"
                    disabled={!devices}
                    onPress={() => setRoute("add")}
                    style={layout.add}
                  >
                    <Glyph name="add" size={28} color="white" />
                  </Pressable>,
                ]
              : []),
            <Pressable
              key={tab.route}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: route === tab.route }}
              onPress={() => setRoute(tab.route)}
              style={layout.tab}
            >
              <View
                style={[layout.tabIcon, route === tab.route && layout.active]}
              >
                <Glyph
                  name={tab.icon}
                  color={route === tab.route ? colors.white : colors.ink}
                />
              </View>
              <Text
                style={[
                  layout.label,
                  route === tab.route && layout.activeLabel,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>,
          ])}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CamHome />
    </SafeAreaProvider>
  );
}

const layout = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  splash: {
    flex: 1,
    backgroundColor: "#7364F5",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    padding: 18,
  },
  splashCamera: {
    width: 95,
    height: 95,
    borderRadius: 32,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  splashTitle: { color: "white", fontSize: 34, fontWeight: "800" },
  splashText: { color: "white", fontSize: 15, textAlign: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 62,
    paddingHorizontal: 16,
    backgroundColor: "#EFEBFF",
  },
  fullPage: { flexGrow: 1, backgroundColor: colors.dark },
  add: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    elevation: 5,
  },
  logo: {
    backgroundColor: colors.blue,
    borderRadius: 16,
    width: 37,
    height: 37,
    justifyContent: "center",
    alignItems: "center",
  },
  nav: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
    minHeight: 48,
  },
  tabIcon: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  active: { backgroundColor: colors.blue },
  label: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
  activeLabel: { color: colors.blue },
});
