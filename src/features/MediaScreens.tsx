import { useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Route } from "../navigation/useNavigation";
import { phoneMedia, sizeLabel, type Photo } from "../storage/phoneMedia";
import {
  Button,
  Card,
  Empty,
  Glyph,
  colors,
  styles,
  type Icon,
} from "../components/ui";

export function MenuRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: Icon;
  label: string;
  detail?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={visual.icon}>
        <Glyph name={icon} size={21} />
      </View>
      <View style={styles.flex}>
        <Text style={visual.label}>{label}</Text>
        {detail && <Text style={styles.description}>{detail}</Text>}
      </View>
      {onPress && (
        <Glyph name="chevron-forward" size={16} color={colors.muted} />
      )}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={visual.row}>
      {body}
    </Pressable>
  ) : (
    <View style={visual.row}>{body}</View>
  );
}

function Filters({
  options,
  selected,
  pick,
}: {
  options: string[];
  selected: string;
  pick: (value: string) => void;
}) {
  return (
    <View style={visual.filters}>
      {options.map((label) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === label }}
          style={[visual.pill, selected === label && visual.active]}
          onPress={() => pick(label)}
        >
          <Text
            style={[visual.pillText, selected === label && { color: "white" }]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Events() {
  const [filter, setFilter] = useState("Tất cả");
  return (
    <>
      <Filters
        options={["Tất cả", "Chuyển động", "Âm thanh"]}
        selected={filter}
        pick={setFilter}
      />
      <Text style={styles.title}>Hôm nay</Text>
      <Card>
        <Empty
          icon="notifications-off-outline"
          title="Chưa có sự kiện"
          detail={
            filter === "Tất cả"
              ? "CamHome chưa nhận sự kiện từ camera đã lưu."
              : `Chưa nhận sự kiện ${filter.toLowerCase()}.`
          }
        />
      </Card>
    </>
  );
}

export function Storage({
  photos,
  navigate,
  refresh,
}: {
  photos: Photo[];
  navigate: (route: Route) => void;
  refresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const bytes = photos.reduce((total, photo) => total + photo.bytes, 0);
  return (
    <>
      <Card>
        <View style={styles.row}>
          <Glyph name="phone-portrait-outline" size={30} />
          <View style={styles.flex}>
            <Text style={styles.title}>Lưu trữ trên điện thoại</Text>
            <Text style={styles.description}>
              {photos.length} ảnh · {sizeLabel(bytes)}
            </Text>
          </View>
        </View>
      </Card>
      <Card>
        <MenuRow
          icon="cloud-outline"
          label="Google Drive"
          detail="Chưa tích hợp · Giới hạn thiết kế 300 GB (hệ thập phân)"
        />
        <MenuRow
          icon="film-outline"
          label="Video đã lưu"
          onPress={() => navigate("playback")}
        />
        <MenuRow
          icon="images-outline"
          label="Ảnh chụp"
          onPress={() => navigate("photos")}
        />
        <MenuRow
          icon="download-outline"
          label="Tải xuống"
          detail="Chọn ảnh để lưu vào Downloads"
          onPress={() => navigate("photos")}
        />
        <MenuRow
          icon="save-outline"
          label="Thẻ nhớ camera"
          detail="Chưa đọc được dung lượng qua TNP"
        />
        {photos.length > 0 && (
          <MenuRow
            icon="trash-outline"
            label="Xóa tất cả ảnh"
            onPress={() =>
              Alert.alert(
                "Xóa tất cả ảnh?",
                "Ảnh trong CamHome sẽ bị xóa khỏi điện thoại.",
                [
                  { text: "Hủy", style: "cancel" },
                  {
                    text: "Xóa",
                    style: "destructive",
                    onPress: () => {
                      void phoneMedia
                        ?.deletePhotos(photos.map((photo) => photo.name))
                        .catch(() => setMessage("Một số ảnh không xóa được."))
                        .finally(refresh);
                    },
                  },
                ],
              )
            }
          />
        )}
      </Card>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {message}
        </Text>
      )}
    </>
  );
}

export function Photos({
  photos,
  refresh,
}: {
  photos: Photo[];
  refresh: () => void;
}) {
  const [selected, select] = useState<Photo>();
  const [message, setMessage] = useState("");
  if (selected)
    return (
      <View style={styles.page}>
        <Button
          label="Danh sách ảnh"
          icon="chevron-back"
          onPress={() => {
            select(undefined);
            setMessage("");
          }}
        />
        <Image
          source={{ uri: selected.uri }}
          accessibilityLabel="Ảnh chụp camera"
          style={visual.photo}
          resizeMode="contain"
        />
        <Text style={styles.description}>
          {new Date(selected.createdAt).toLocaleString("vi-VN")} ·{" "}
          {sizeLabel(selected.bytes)}
        </Text>
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={styles.description}>
            {message}
          </Text>
        )}
        <Button
          label="Chia sẻ ảnh"
          icon="share-social-outline"
          onPress={() => {
            void phoneMedia
              ?.sharePhoto(selected.name)
              .catch(() => setMessage("Không chia sẻ được ảnh."));
          }}
        />
        {Number(Platform.Version) >= 29 && (
          <Button
            label="Tải ảnh xuống"
            icon="download-outline"
            onPress={() => {
              void phoneMedia
                ?.downloadPhoto(selected.name)
                .then(() => setMessage("Đã lưu vào Downloads/CamHome."))
                .catch(() => setMessage("Không tải được ảnh xuống."));
            }}
          />
        )}
        <Button
          label="Xóa ảnh"
          icon="trash-outline"
          onPress={() =>
            Alert.alert("Xóa ảnh?", "Ảnh sẽ bị xóa khỏi CamHome.", [
              { text: "Hủy", style: "cancel" },
              {
                text: "Xóa",
                style: "destructive",
                onPress: () => {
                  void phoneMedia
                    ?.deletePhotos([selected.name])
                    .then(() => {
                      select(undefined);
                      refresh();
                    })
                    .catch(() => setMessage("Không xóa được ảnh."));
                },
              },
            ])
          }
        />
      </View>
    );

  return (
    <FlatList
      data={photos}
      keyExtractor={(photo) => photo.name}
      contentContainerStyle={styles.page}
      ListEmptyComponent={
        <Card>
          <Empty
            icon="images-outline"
            title="Chưa có ảnh chụp"
            detail="Ảnh chụp từ Live View sẽ xuất hiện ở đây."
          />
        </Card>
      }
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => select(item)}>
          <Card>
            <Image
              source={{ uri: item.uri }}
              style={visual.photo}
              resizeMode="cover"
            />
            <Text style={styles.description}>
              {new Date(item.createdAt).toLocaleString("vi-VN")} ·{" "}
              {sizeLabel(item.bytes)}
            </Text>
          </Card>
        </Pressable>
      )}
    />
  );
}

export function Account({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <>
      <Card>
        <View style={styles.row}>
          <View style={visual.avatar}>
            <Glyph name="person" color="white" size={28} />
          </View>
          <View>
            <Text style={styles.title}>CamHome</Text>
            <Text style={styles.description}>Phiên bản 1.0.0</Text>
          </View>
        </View>
      </Card>
      <Card>
        <MenuRow
          icon="videocam-outline"
          label="Quản lý thiết bị"
          onPress={() => navigate("multi")}
        />
        <MenuRow
          icon="shield-checkmark-outline"
          label="Quyền ứng dụng"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              Alert.alert("Không mở được cài đặt Android"),
            )
          }
        />
        <MenuRow icon="sunny-outline" label="Giao diện" detail="Sáng" />
        <MenuRow
          icon="lock-closed-outline"
          label="Bảo mật"
          detail="Khóa TNP được lưu với Android Keystore."
        />
        <MenuRow
          icon="cloud-upload-outline"
          label="Sao lưu & khôi phục"
          detail="Chưa hỗ trợ"
        />
        <MenuRow
          icon="information-circle-outline"
          label="Hướng dẫn sử dụng"
          onPress={() =>
            Alert.alert(
              "CamHome",
              "Đặt điện thoại cùng Wi-Fi với YI06. Tìm camera trong LAN, nhập khóa TNP đã có và mở Live View.",
            )
          }
        />
      </Card>
    </>
  );
}

const visual = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 6,
  },
  icon: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: "#EFEBFF",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: 22,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  active: { backgroundColor: colors.blue, borderColor: colors.blue },
  pillText: { color: colors.ink, fontSize: 12, fontWeight: "700" },

  photo: {
    backgroundColor: colors.dark,
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
  },
  avatar: {
    backgroundColor: colors.blue,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
});
