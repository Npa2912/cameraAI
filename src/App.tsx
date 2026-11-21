import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  Empty,
  Glyph,
  IconButton,
  colors,
  styles,
  type Icon,
} from "./components/ui";
import { AddCamera } from "./features/AddCamera";
import { Library, Live } from "./features/Live";
import { Settings } from "./features/Settings";
import {
  loadDevices,
  saveDevices,
  saveLabel,
  removeLabel,
} from "./storage/devices";

import { DuplicateDeviceError } from "./services/deviceInput";
import { useNavigation, type Tab } from "./navigation/useNavigation";

const tabs: { route: Tab; label: string; icon: Icon }[] = [
  { route: "home", label: "Trang chủ", icon: "home-outline" },
  { route: "events", label: "Sự kiện", icon: "notifications-outline" },
  { route: "storage", label: "Lưu trữ", icon: "folder-open-outline" },
  { route: "settings", label: "Cài đặt", icon: "settings-outline" },
];

function CamHome() {
  const { route, setRoute, back } = useNavigation();
  const [selectedId, setSelectedId] = useState<string>();
  const [devices, setDevices] = useState<Camera[]>();
  const [loadError, setLoadError] = useState(false);
  const writing = useRef(false);
  const selected = devices?.find((device) => device.id === selectedId);
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
  ) {
    if (writing.current) throw new Error("Write already in progress");
    writing.current = true;
    try {
      if (label) await saveLabel(label.id, label.value);
      try {
        await saveDevices(next);
      } catch (error) {
        if (label) await removeLabel(label.id).catch(() => undefined);
        throw error;
      }
      setDevices(next);
    } finally {
      writing.current = false;
    }
  }

  const title =
    route === "home"
      ? "CamHome"
      : route === "add"
        ? "Thêm camera"
        : route === "live"
          ? selected?.name
          : route === "settings" || route === "deviceSettings"
            ? "Cài đặt"
            : "Sự kiện & Lưu trữ";

  return (
    <SafeAreaView style={layout.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        key={route === "storage" ? "events" : route}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {route === "home" && (
            <View style={layout.logo}>
              <Glyph name="camera" size={30} color={colors.white} />
            </View>
          )}
          {!showTabs && (
            <IconButton label="Quay lại" icon="chevron-back" onPress={back} />
          )}
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={styles.heading}>
              {title}
            </Text>
            {route === "home" && (
              <Text style={styles.description}>
                Giám sát an ninh thông minh
              </Text>
            )}
            {route === "live" && (
              <Text style={styles.description}>Kết nối chưa xác minh</Text>
            )}
          </View>
          {route === "home" && devices && (
            <IconButton
              label="Thêm camera"
              icon="add"
              primary
              onPress={() => setRoute("add")}
            />
          )}
        </View>
        {route === "home" && (
          <>
            <Text style={styles.title}>
              Thiết bị của tôi{devices ? " (" + devices.length + ")" : ""}
            </Text>
            {loadError ? (
              <Card>
                <Text style={styles.description}>
                  Không đọc được danh sách thiết bị.
                </Text>
                <Button label="Tải lại" onPress={() => void reload()} />
              </Card>
            ) : !devices ? (
              <ActivityIndicator color={colors.blue} />
            ) : devices.length === 0 ? (
              <Card>
                <Empty
                  icon="videocam-outline"
                  title="Chưa có camera"
                  detail="Quét mã QR hoặc nhập địa chỉ IP để bắt đầu."
                />
                <Button
                  label="Thêm camera"
                  icon="add"
                  primary
                  onPress={() => setRoute("add")}
                />
              </Card>
            ) : (
              devices.map((device) => (
                <Pressable
                  key={device.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedId(device.id);
                    setRoute("live");
                  }}
                >
                  <Card>
                    <View style={styles.row}>
                      <View style={layout.deviceIcon}>
                        <Glyph name="videocam-outline" />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.title}>{device.name}</Text>
                        <Text style={styles.description}>
                          {device.address ?? "Chưa nhập IP"} · Chưa xác minh
                        </Text>
                      </View>
                      <Glyph name="chevron-forward" color={colors.ink} />
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
          </>
        )}
        {route === "add" && devices && (
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
        {route === "live" && selected && (
          <Live
            camera={selected}
            onSettings={() => setRoute("deviceSettings")}
          />
        )}
        {(route === "events" || route === "storage") && (
          <Library tab={route} select={setRoute} />
        )}
        {(route === "settings" || route === "deviceSettings") && (
          <Settings
            camera={route === "deviceSettings" ? selected : undefined}
            rename={async (name) => {
              if (selected && devices)
                await persist(
                  devices.map((device) =>
                    device.id === selected.id ? { ...device, name } : device,
                  ),
                );
            }}
            remove={async () => {
              if (selected && devices) {
                await removeLabel(selected.id);
                await persist(
                  devices.filter((device) => device.id !== selected.id),
                );
              }
              setSelectedId(undefined);
              setRoute("home");
            }}
          />
        )}
      </ScrollView>
      {showTabs && (
        <View style={layout.nav}>
          {tabs.map((tab) => (
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
            </Pressable>
          ))}
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
  logo: {
    backgroundColor: colors.blue,
    borderRadius: 16,
    width: 52,
    height: 52,
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
  deviceIcon: { backgroundColor: "#E1EDFF", padding: 12, borderRadius: 16 },
});
