export type Capability = "Verified" | "Unsupported" | "Unknown";
export type Capabilities = Record<
  | "video"
  | "audioReceive"
  | "talk"
  | "ptz"
  | "snapshot"
  | "recording"
  | "playback"
  | "events"
  | "cardUsage"
  | "quality",
  Capability
>;
export type Camera = {
  id: string;
  name: string;
  address?: string;
  model?: string;
  firmware?: string;
};
export type Recording = {
  id: string;
  kind: "video" | "photo" | "event";
  createdAt: string;
  uri: string;
};
export type Direction = "up" | "down" | "left" | "right" | "stop";

export class CameraError extends Error {
  constructor(
    public readonly code:
      "unverified" | "offline" | "auth" | "timeout" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "CameraError";
  }
}

export interface CameraAdapter {
  discover(signal: AbortSignal): Promise<Camera[]>;
  pair(camera: Camera, signal: AbortSignal): Promise<void>;
  connect(camera: Camera, signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  getCapabilities(): Capabilities;
  startVideo(): Promise<{ uri: string; width?: number; height?: number }>;
  stopVideo(): Promise<void>;
  startAudioReceive(): Promise<void>;
  stopAudioReceive(): Promise<void>;
  startTalk(): Promise<void>;
  stopTalk(): Promise<void>;
  movePTZ(direction: Direction): Promise<void>;
  snapshot(): Promise<Recording>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<Recording>;
  listRecordings(): Promise<Recording[]>;
}
