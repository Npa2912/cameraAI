import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Camera } from "../adapters/CameraAdapter";

const key = "camhome.devices.v1";
export async function loadDevices(): Promise<Camera[]> {
  const data = await AsyncStorage.getItem(key);
  return data ? (JSON.parse(data) as Camera[]) : [];
}
export async function saveDevices(devices: Camera[]) {
  await AsyncStorage.setItem(key, JSON.stringify(devices));
}

export function saveLabel(id: string, label: string) {
  return SecureStore.setItemAsync(`camhome.label.${id}`, label);
}

export function removeLabel(id: string) {
  return SecureStore.deleteItemAsync(`camhome.label.${id}`);
}
