import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import type { Route } from "../navigation/useNavigation";
import {
  Button,
  Card,
  Empty,
  Glyph,
  IconButton,
  colors,
  styles,
  type Icon,
} from "../components/ui";

type Props = {
  devices: Camera[];
  online?: Set<string>;
  previews: Record<string, string>;
  grid: boolean;
  multi: boolean;
  toggleGrid: () => void;
  navigate: (route: Route) => void;
  open: (camera: Camera) => void;
  configure: (camera: Camera) => void;
};

const shortcuts: { title: string; route: Route; icon: Icon; color: string }[] =
  [
    {
      title: "Nhiều camera",
      route: "multi",
      icon: "videocam-outline",
      color: colors.blue,
    },
    {
      title: "Xem lại",
      route: "playback",
      icon: "time-outline",
      color: "#5265D7",
    },
    {
      title: "Cảnh báo",
      route: "events",
      icon: "notifications-outline",
      color: colors.danger,
    },
    {
      title: "Thiết lập",
      route: "settings",
      icon: "settings-outline",
      color: colors.ink,
    },
  ];

export function CameraBoard({
  devices,
  online,
  previews,
  grid,
  multi,
  toggleGrid,
  navigate,
  open,
  configure,
}: Props) {
  const reachable = devices.filter(
    (device) => device.tnpUid && online?.has(device.tnpUid),
  ).length;
  return (
    <FlatList
      key={grid ? "grid" : "list"}
      data={devices}
      numColumns={grid ? 2 : 1}
      keyExtractor={(device) => device.id}
      contentContainerStyle={styles.page}
      columnWrapperStyle={grid ? { gap: 10 } : undefined}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
          {!multi && (
            <>
              <View style={board.summary}>
                <View style={styles.flex}>
                  <Text style={board.summaryLabel}>Tổng quan mạng nhà</Text>
                  <Text style={board.summaryValue}>
                    {devices.length} camera
                  </Text>
                  <Text style={board.summaryLabel}>
                    {online
                      ? `${reachable} thiết bị phản hồi qua LAN`
                      : "Giám sát qua Wi-Fi"}
                  </Text>
                </View>
                <Glyph name="wifi-outline" color="#E3E6FF" size={44} />
              </View>
              <View style={board.shortcuts}>
                {shortcuts.map((item) => (
                  <Pressable
                    key={item.route}
                    accessibilityRole="button"
                    style={board.shortcut}
                    onPress={() => navigate(item.route)}
                  >
                    <Glyph name={item.icon} color={item.color} size={23} />
                    <Text style={board.shortcutLabel}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <View style={styles.row}>
            <Text style={[styles.title, styles.flex]}>
              {multi ? "Thiết bị đã lưu" : `Camera của tôi (${devices.length})`}
            </Text>
            <IconButton
              label={grid ? "Dạng danh sách" : "Dạng lưới"}
              icon={grid ? "list-outline" : "grid-outline"}
              onPress={toggleGrid}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Empty
            icon="videocam-outline"
            title="Chưa có camera"
            detail="Tìm camera qua Wi-Fi, nhập IP hoặc quét mã QR."
          />
          <Button
            label="Thêm camera"
            icon="add"
            primary
            onPress={() => navigate("add")}
          />
        </Card>
      }
      renderItem={({ item }) => {
        const active = item.tnpUid && online?.has(item.tnpUid);
        const state =
          item.driver && online
            ? active
              ? "Online"
              : "Offline"
            : "Chưa xác minh";
        const preview = previews[item.id];
        return (
          <View style={[board.camera, grid && { flex: 1, maxWidth: "50%" }]}>
            <View style={board.cameraHead}>
              <Glyph name="videocam" size={17} />
              <Pressable
                accessibilityRole="button"
                onPress={() => open(item)}
                style={styles.flex}
              >
                <Text numberOfLines={1} style={board.name}>
                  {item.name}
                </Text>
              </Pressable>
              {!grid && (
                <Text style={[board.badge, active && board.online]}>
                  {state}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Cài đặt ${item.name}`}
                hitSlop={6}
                onPress={() => configure(item)}
              >
                <Glyph
                  name="ellipsis-horizontal"
                  size={19}
                  color={colors.ink}
                />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mở ${item.name}`}
              onPress={() => open(item)}
              style={[board.preview, grid && { aspectRatio: 1.32 }]}
            >
              {preview && (
                <Image
                  source={{ uri: preview }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              )}
              <View style={board.play}>
                <Glyph name="play" size={20} color={colors.white} />
              </View>
              <Text style={board.previewLabel}>
                {preview ? "Ảnh chụp gần nhất" : "Mở Live View"}
              </Text>
            </Pressable>
            <View style={board.footer}>
              <Text numberOfLines={1} style={[styles.description, styles.flex]}>
                {item.address ?? "Chưa nhập IP"}
              </Text>
              {grid && (
                <Text style={[board.badge, active && board.online]}>
                  {state}
                </Text>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

const board = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#576DE2",
    gap: 14,
  },
  summaryLabel: { color: "#F5F4FF", fontSize: 12, fontWeight: "600" },
  summaryValue: {
    color: "white",
    fontSize: 27,
    fontWeight: "800",
    marginVertical: 3,
  },
  shortcuts: { flexDirection: "row", gap: 8 },
  shortcut: {
    backgroundColor: colors.panel,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    minHeight: 80,
    padding: 4,
  },
  shortcutLabel: {
    fontSize: 11,
    color: colors.ink,
    textAlign: "center",
    fontWeight: "700",
  },
  camera: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#675E90",
  },
  cameraHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  name: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  badge: {
    backgroundColor: "#EEECF7",
    color: colors.muted,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "700",
  },
  online: { backgroundColor: "#DCF7EA", color: colors.success },
  preview: {
    marginHorizontal: 4,
    aspectRatio: 2.25,
    backgroundColor: "#292643",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7D0F6",
    backgroundColor: "#4E4675",
  },
  previewLabel: {
    color: "#F2EFFF",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "#292643",
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  footer: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
});
