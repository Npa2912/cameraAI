import { NativeModules } from "react-native";

export type Photo = {
  name: string;
  uri: string;
  bytes: number;
  createdAt: number;
};

type PhoneMedia = {
  listPhotos(): Promise<Photo[]>;
  sharePhoto(name: string): Promise<void>;
  downloadPhoto(name: string): Promise<void>;
  deletePhotos(names: string[]): Promise<void>;
  landscape(enabled: boolean): Promise<void>;
};

export const phoneMedia = NativeModules.CamHomePhoneMedia as
  PhoneMedia | undefined;

export function sizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 ** 2).toFixed(1) + " MB";
}
