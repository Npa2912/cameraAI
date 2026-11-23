import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  findNodeHandle,
  Pressable,
  requireNativeComponent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type ViewProps,
} from "react-native";
import type { Camera } from "../adapters/CameraAdapter";
import { Button, Card, Empty, colors, styles } from "../components/ui";
import { dayStart, recordingDay } from "../recording/retention";
import { recordingStore, type Segment } from "../recording/store";

const DAY = 86_400_000;
const Player = recordingStore
  ? requireNativeComponent<
      ViewProps & { clip: { id: string; offset: number; token: string } }
    >("CamHomeRecordingPlayer")
  : undefined;

function clock(milliseconds: number) {
  return new Date(milliseconds + 7 * 3_600_000).toISOString().slice(11, 19);
}

export function RecordingPlayback({ cameras }: { cameras: Camera[] }) {
  const [camera, setCamera] = useState(cameras[0]?.id);
  const [records, setRecords] = useState<Segment[]>([]);
  const [day, setDay] = useState(recordingDay(Date.now()));
  const [time, setTime] = useState("00:00:00");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("local");
  const [selected, setSelected] = useState<{
    id: string;
    offset: number;
    token: string;
  }>();
  const [next, setNext] = useState<Segment>();
  const player = useRef<ComponentRef<NonNullable<typeof Player>>>(null);

  useEffect(() => {
    if (!camera || !recordingStore) return;
    let active = true;
    setLoading(true);
    setMessage("");
    setRecords([]);
    setSelected(undefined);
    setNext(undefined);
    void recordingStore
      .list(camera)
      .then((items) => {
        if (!active) return;
        setRecords(items);
        const latest = items.at(-1);
        if (latest) {
          setDay(recordingDay(latest.startMs));
          setTime(clock(latest.startMs));
        }
      })
      .catch(() => {
        if (active) setMessage("Không đọc được lịch sử ghi hình.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [camera]);

  function open(segment: Segment, timestamp: number) {
    setDay(recordingDay(timestamp));
    setTime(clock(timestamp));
    setSelected({
      id: segment.id,
      offset: Math.max(0, Math.round(timestamp - segment.startMs)),
      token: randomUUID(),
    });
    setMessage("");
    setNext(undefined);
  }

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "camhomePlayback",
      (event: { token: string; kind: string; position: number }) => {
        if (!selected || event.token !== selected.token) return;
        const index = records.findIndex((item) => item.id === selected.id);
        if (index < 0) return;
        const current = records[index];
        if (event.kind === "seeked")
          setTime(clock(current.startMs + event.position));
        if (event.kind === "error")
          setMessage("Không phát được đoạn video này.");
        if (event.kind !== "ended") return;
        const following = records[index + 1];
        if (!following) {
          setMessage("Đã hết bản ghi.");
          return;
        }
        if (following.startMs > current.endMs + 500) {
          setNext(following);
          setMessage("Có khoảng trống trong bản ghi.");
        } else
          open(
            following,
            Math.max(
              following.startMs,
              Math.min(following.endMs - 1, current.endMs),
            ),
          );
      },
    );
    return () => subscription.remove();
  }, [selected, records]);

  function seek(timestamp: number) {
    const found = records.find(
      (item) => item.startMs <= timestamp && timestamp < item.endMs,
    );
    if (found) {
      open(found, timestamp);
      return;
    }
    setMessage("Không có video tại thời điểm đã chọn.");
    setNext(records.find((item) => item.startMs > timestamp));
  }

  function command(name: string, parameters: number[] = []) {
    const tag = findNodeHandle(player.current);
    if (tag != null)
      UIManager.dispatchViewManagerCommand(tag, name, parameters);
  }

  const dates = [...new Set(records.map((item) => recordingDay(item.startMs)))];
  const base = dayStart(day);
  const marks = records.filter(
    (item) => item.startMs < base + DAY && item.endMs > base,
  );
  const timestamp = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)
    ? Date.parse(`${day}T${time}+07:00`)
    : Number.NaN;

  return (
    <>
      <View style={styles.row}>
        <Button
          label="Điện thoại"
          primary={source === "local"}
          onPress={() => setSource("local")}
        />
        <Button
          label="Thẻ nhớ"
          primary={source === "sd"}
          onPress={() => {
            setSelected(undefined);
            setSource("sd");
          }}
        />
      </View>
      {source === "sd" ? (
        <Card>
          <Empty
            icon="save-outline"
            title="Chưa hỗ trợ xem thẻ nhớ qua TNP"
            detail="Chọn Điện thoại để xem video CamHome ghi."
          />
        </Card>
      ) : (
        <>
          {cameras.length > 1 && (
            <ScrollView horizontal contentContainerStyle={styles.row}>
              {cameras.map((item) => (
                <Button
                  key={item.id}
                  label={item.name}
                  primary={item.id === camera}
                  onPress={() => setCamera(item.id)}
                />
              ))}
            </ScrollView>
          )}
          <View style={visual.player}>
            {selected && Player ? (
              <Player
                ref={player}
                clip={selected}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Text style={visual.empty}>
                {loading ? "Đang đọc bản ghi…" : "Chưa có video đã ghi"}
              </Text>
            )}
            {loading && <ActivityIndicator color="white" />}
          </View>
          {selected && (
            <View style={styles.row}>
              <Button
                label="−10 giây"
                onPress={() => command("skip", [-10000])}
              />
              <Button
                label="Phát / Tạm dừng"
                onPress={() => command("toggle")}
              />
              <Button
                label="+10 giây"
                onPress={() => command("skip", [10000])}
              />
            </View>
          )}
          {dates.length > 0 && (
            <Card>
              <Text style={styles.title}>Ngày có bản ghi</Text>
              <ScrollView horizontal contentContainerStyle={styles.row}>
                {dates.map((date) => (
                  <Button
                    key={date}
                    label={date}
                    primary={date === day}
                    onPress={() => {
                      setDay(date);
                      const first = records.find(
                        (item) => recordingDay(item.startMs) === date,
                      );
                      if (first) open(first, first.startMs);
                    }}
                  />
                ))}
              </ScrollView>
              <View style={styles.row}>
                <TextInput
                  accessibilityLabel="Giờ, phút, giây"
                  value={time}
                  onChangeText={setTime}
                  placeholder="00:00:00"
                  autoCorrect={false}
                  maxLength={8}
                  style={[styles.input, styles.flex]}
                />
                <Button
                  label="Đến giờ"
                  primary
                  disabled={!Number.isFinite(timestamp)}
                  onPress={() => seek(timestamp)}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.title, styles.flex]}>
                  Timeline · UTC+7
                </Text>
                <Button
                  label="−"
                  disabled={zoom === 1}
                  onPress={() => setZoom(zoom / 2)}
                />
                <Button
                  label="+"
                  disabled={zoom >= 8}
                  onPress={() => setZoom(zoom * 2)}
                />
              </View>
              <View
                onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
              >
                <ScrollView horizontal>
                  <View style={{ width: width * zoom }}>
                    <View style={visual.hours}>
                      {[0, 6, 12, 18, 24].map((hour) => (
                        <Text key={hour} style={visual.label}>
                          {String(hour).padStart(2, "0")}:00
                        </Text>
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="adjustable"
                      accessibilityLabel="Dòng thời gian ghi hình"
                      style={visual.track}
                      onPress={(event) => {
                        const fraction =
                          event.nativeEvent.locationX /
                          Math.max(1, width * zoom);
                        seek(
                          base +
                            Math.min(
                              DAY - 1,
                              Math.max(0, Math.floor(fraction * DAY)),
                            ),
                        );
                      }}
                    >
                      <View
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      >
                        {marks.map((item) => (
                          <View
                            key={item.id}
                            style={[
                              visual.mark,
                              {
                                left: `${((Math.max(base, item.startMs) - base) / DAY) * 100}%`,
                                width: `${((Math.min(base + DAY, item.endMs) - Math.max(base, item.startMs)) / DAY) * 100}%`,
                              },
                            ]}
                          />
                        ))}
                        {Number.isFinite(timestamp) && (
                          <View
                            style={[
                              visual.cursor,
                              {
                                left: `${((timestamp - base) / DAY) * 100}%`,
                              },
                            ]}
                          />
                        )}
                      </View>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </Card>
          )}
          {!!message && (
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              {message}
            </Text>
          )}
          {next && (
            <Button
              label="Đến bản ghi tiếp theo"
              onPress={() => open(next, next.startMs)}
            />
          )}
        </>
      )}
    </>
  );
}

const visual = StyleSheet.create({
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  empty: { color: "white", textAlign: "center" },
  hours: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  label: { fontSize: 10, color: colors.muted },
  track: {
    height: 36,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#E3E2EB",
  },
  mark: {
    height: "100%",
    position: "absolute",
    backgroundColor: colors.blue,
    minWidth: 1,
  },
  cursor: {
    position: "absolute",
    height: "100%",
    width: 2,
    backgroundColor: colors.ink,
  },
});
