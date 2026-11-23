import { NativeModules, Platform } from "react-native";

type Discovery = { address: string; uid: string };

type NativeYiq6 = {
  discover(): Promise<Discovery[]>;
  verify(address: string, uid: string, key: string): Promise<string>;
};

export const yiq6 =
  Platform.OS === "android"
    ? (NativeModules.CamHomeYiq6 as NativeYiq6 | undefined)
    : undefined;

export function lanError(error: unknown) {
  switch ((error as { code?: string } | undefined)?.code) {
    case "auth":
      return "Camera từ chối khóa ghép nối.";
    case "auth_result":
      return "Camera tr? m? l?i x?c th?c TNP.";
    case "discovery_timeout":
      return "H?t th?i gian t?m camera qua LAN.";
    case "handshake_timeout":
      return "?? t?m th?y camera nh?ng TNP handshake h?t th?i gian.";
    case "auth_timeout":
      return "?? k?t n?i TNP nh?ng camera ch?a tr? l?i x?c th?c.";
    case "protocol":
      return "Ph?n h?i TNP sai ??nh d?ng ho?c l?nh kh?ng ???c h? tr?.";
    case "input":
      return "Cần địa chỉ IPv4 riêng và khóa TNP hợp lệ (15 byte).";
    default:
      return "Không kết nối được qua LAN. Kiểm tra Wi-Fi và địa chỉ camera.";
  }
}
