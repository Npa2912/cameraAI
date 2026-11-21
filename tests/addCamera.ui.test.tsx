import { PermissionStatus } from "expo-modules-core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { useCameraPermissions } from "expo-camera";
import { Linking } from "react-native";
import { AddCamera } from "../src/features/AddCamera";

jest.mock("expo-camera", () => ({
  CameraView: ({
    onBarcodeScanned,
  }: {
    onBarcodeScanned: (event: { data: string }) => void;
  }) => {
    const { Pressable } = jest.requireActual("react-native");
    return (
      <Pressable
        testID="mock-scanner"
        onPress={() => onBarcodeScanned({ data: "mock-label-data" })}
      />
    );
  },
  useCameraPermissions: jest.fn(),
}));

const mockPermission = jest.mocked(useCameraPermissions);
const getPermission = jest.fn();

afterEach(() => jest.restoreAllMocks());

test("asks for camera permission when scanning starts and shows denial", async () => {
  const denied = {
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: true,
    expires: "never",
  } as const;
  const request = jest.fn().mockResolvedValue(denied);
  mockPermission.mockReturnValue([denied, request, getPermission]);
  render(<AddCamera onSave={jest.fn()} />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Quét QR"));
  expect(
    await screen.findByText("Cần quyền camera của điện thoại để quét mã QR."),
  ).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("mock-scanner")).toBeNull();
});

test("links to Android settings if Android will no longer prompt", async () => {
  const denied = {
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    expires: "never",
  } as const;
  const request = jest.fn();
  mockPermission.mockReturnValue([denied, request, getPermission]);
  const openSettings = jest
    .spyOn(Linking, "openSettings")
    .mockResolvedValue(undefined);
  render(<AddCamera onSave={jest.fn()} />);
  fireEvent.press(screen.getByText("Mở cài đặt quyền"));
  await waitFor(() => expect(openSettings).toHaveBeenCalledTimes(1));
  expect(request).not.toHaveBeenCalled();
});

test("an emitted QR label is only saved when the user confirms", async () => {
  const granted = {
    status: PermissionStatus.GRANTED,
    granted: true,
    canAskAgain: true,
    expires: "never",
  } as const;
  mockPermission.mockReturnValue([granted, jest.fn(), getPermission]);
  const save = jest.fn().mockResolvedValue(undefined);
  render(<AddCamera onSave={save} />);
  fireEvent.press(screen.getByText("Quét QR"));
  fireEvent.press(await screen.findByTestId("mock-scanner"));
  expect(
    screen.getByText("Đã đọc mã QR của thiết bị. Chưa ghép nối camera."),
  ).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Lưu thiết bị"));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(undefined, "mock-label-data"),
  );
});

test("validates manual IPv4 and reports local storage errors", async () => {
  mockPermission.mockReturnValue([null, jest.fn(), getPermission]);
  const save = jest.fn().mockRejectedValue(new Error("mock write failure"));
  render(<AddCamera onSave={save} />);
  const address = screen.getByLabelText("Địa chỉ IPv4");
  fireEvent.changeText(address, "192.0.2.999");
  fireEvent.press(screen.getByText("Lưu thiết bị"));
  expect(screen.getByText("Nhập địa chỉ IPv4 hợp lệ của camera.")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(address, "192.0.2.10");
  fireEvent.press(screen.getByText("Lưu thiết bị"));
  expect(
    await screen.findByText("Không lưu được thiết bị. Vui lòng thử lại."),
  ).toBeTruthy();
  expect(save).toHaveBeenCalledWith("192.0.2.10", undefined);
});
