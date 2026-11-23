import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Camera } from "../adapters/CameraAdapter";

export function loadBridge(id: string) {
  return SecureStore.getItemAsync(`camhome.bridge.${id}`);
}

export function saveBridge(id: string, code: string) {
  return SecureStore.setItemAsync(`camhome.bridge.${id}`, code);
}

export function removeBridge(id: string) {
  return SecureStore.deleteItemAsync(`camhome.bridge.${id}`);
}

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

export function loadYiq6Key(id: string) {
  return SecureStore.getItemAsync(`camhome.yiq6.${id}`);
}

export function saveYiq6Key(id: string, key: string) {
  return SecureStore.setItemAsync(`camhome.yiq6.${id}`, key);
}

export function removeYiq6Key(id: string) {
  return SecureStore.deleteItemAsync(`camhome.yiq6.${id}`);
}
