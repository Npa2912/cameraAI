import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert, BackHandler } from "react-native";
import App from "../src/App";
import { adapter } from "../src/adapters/UnverifiedAdapter";
import {
  loadBridge,
  loadDevices,
  saveBridge,
  saveDevices,
} from "../src/storage/devices";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [null, jest.fn()],
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "generated-id" }));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("../src/storage/devices", () => ({
  loadDevices: jest.fn(),
  saveDevices: jest.fn(),
  saveLabel: jest.fn(),
  removeLabel: jest.fn(),
  loadBridge: jest.fn(),
  saveBridge: jest.fn(),
  removeBridge: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadDevices).mockResolvedValue([]);
  jest.mocked(saveDevices).mockResolvedValue(undefined);
});

test("creates an IP profile, reports Live View unavailable and renames the profile", async () => {
  render(<App />);
  await screen.findByText("Chưa có camera");
  fireEvent.press(screen.getByText("Thêm camera"));
  fireEvent.changeText(screen.getByLabelText("Địa chỉ IPv4"), "192.0.2.10");
  fireEvent.press(screen.getByText("Lưu thiết bị"));
  fireEvent.press(await screen.findByText("Camera mới"));
  expect(
    await screen.findByText("Chưa xác minh giao thức của camera này."),
  ).toBeTruthy();
  expect(screen.queryByText("Đàm thoại")).toBeNull();
  expect(screen.queryByText("Ghi hình")).toBeNull();

  fireEvent.press(screen.getByText("Cài đặt camera"));
  fireEvent.changeText(screen.getByLabelText("Tên camera"), "Phòng khách");
  fireEvent.press(screen.getByText("Lưu tên"));
  await waitFor(() =>
    expect(saveDevices).toHaveBeenLastCalledWith([
      { id: "generated-id", name: "Phòng khách", address: "192.0.2.10" },
    ]),
  );
});

test("requires confirmation before removing a profile", async () => {
  jest
    .mocked(loadDevices)
    .mockResolvedValue([{ id: "fixture", name: "Hồ sơ kiểm thử" }]);
  const dialog = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  try {
    render(<App />);
    fireEvent.press(await screen.findByText("Hồ sơ kiểm thử"));
    fireEvent.press(screen.getByText("Cài đặt camera"));
    fireEvent.press(screen.getByText("Xóa camera"));
    expect(saveDevices).not.toHaveBeenCalled();
    const buttons = dialog.mock.calls[0]?.[2];
    expect(buttons?.find((button) => button.text === "Hủy")).toBeDefined();
    await act(async () => {
      buttons?.find((button) => button.text === "Xóa")?.onPress?.();
    });
    expect(await screen.findByText("Chưa có camera")).toBeTruthy();
    expect(saveDevices).toHaveBeenCalledWith([]);
  } finally {
    dialog.mockRestore();
  }
});

test("events and storage stay empty without camera data", async () => {
  render(<App />);
  await screen.findByText("Chưa có camera");
  fireEvent.press(screen.getByRole("tab", { name: "Sự kiện" }));
  expect(screen.getByText("Chưa có sự kiện")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Lưu trữ" }));
  expect(screen.getByText("0 ảnh · 0 B")).toBeTruthy();
  fireEvent.press(screen.getByText("Video đã lưu"));
  expect(screen.getByText("Chưa có video đã ghi")).toBeTruthy();
  fireEvent.press(screen.getByText("Thẻ nhớ"));
  expect(screen.getByText("Chưa hỗ trợ xem thẻ nhớ qua TNP")).toBeTruthy();
});

test("Android Back leaves Live View and releases the adapter session", async () => {
  jest
    .mocked(loadDevices)
    .mockResolvedValue([{ id: "fixture", name: "Hồ sơ kiểm thử" }]);
  let handleBack: (() => boolean | null | undefined) | undefined;
  const listener = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_name, handler) => {
      handleBack = handler;
      return { remove: jest.fn() };
    });
  const disconnect = jest.spyOn(adapter, "disconnect");
  try {
    render(<App />);
    fireEvent.press(await screen.findByText("Hồ sơ kiểm thử"));
    await screen.findByText("Chưa có video trực tiếp");
    act(() => expect(handleBack?.()).toBe(true));
    expect(await screen.findByText("CamHome")).toBeTruthy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    listener.mockRestore();
    disconnect.mockRestore();
  }
});

test("stores the YIQ6 bridge access code separately from the device profile", async () => {
  const camera = { id: "yi", name: "YIQ6", address: "192.168.50.31" };
  const code = "a".repeat(32);
  jest.mocked(loadDevices).mockResolvedValue([camera]);
  jest.mocked(loadBridge).mockResolvedValue(null);
  render(<App />);
  fireEvent.press(await screen.findByText("YIQ6"));
  fireEvent.press(screen.getByText("Cài đặt camera"));
  fireEvent.changeText(
    screen.getByLabelText("Địa chỉ bridge"),
    "192.168.50.10:8765",
  );
  fireEvent.changeText(screen.getByLabelText("Mã truy cập bridge"), code);
  fireEvent.press(screen.getByText("Lưu bridge YIQ6"));
  await screen.findByText("Đã lưu cấu hình bridge.");
  expect(saveBridge).toHaveBeenCalledWith("yi", code);
  expect(saveDevices).toHaveBeenCalledWith([
    { ...camera, model: "YIQ6", bridge: "192.168.50.10:8765" },
  ]);
});

test("opens the camera grid and returns from the same Live View", async () => {
  jest
    .mocked(loadDevices)
    .mockResolvedValue([{ id: "one", name: "Sân trước" }]);
  render(<App />);
  await screen.findByText("Sân trước");
  fireEvent.press(screen.getByText("Nhiều camera"));
  expect(screen.getByText("Thiết bị đã lưu")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Mở Sân trước" }));
  await screen.findByText("Chưa có video trực tiếp");
  fireEvent.press(screen.getByRole("button", { name: "Quay lại" }));
  expect(screen.getByText("Thiết bị đã lưu")).toBeTruthy();
});
