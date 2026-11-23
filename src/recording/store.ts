import { NativeModules } from "react-native";

export type Segment = {
  id: string;
  uri: string;
  startMs: number;
  endMs: number;
  width: number;
  height: number;
  size: number;
  checksum: string;
  fps: number;
};
export const recordingStore = NativeModules.CamHomeRecordings as
  { list(camera: string): Promise<Segment[]> } | undefined;
