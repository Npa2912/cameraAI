import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import App from "../src/App";
import { loadDevices, saveDevices } from "../src/storage/devices";

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
  expect(screen.getByText("Chưa có bản ghi")).toBeTruthy();
});
