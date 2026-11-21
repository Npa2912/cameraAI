import {
  CameraError,
  type CameraAdapter,
  type Capabilities,
} from "./CameraAdapter";

function unavailable(): Promise<never> {
  return Promise.reject(
    new CameraError("unverified", "Chưa xác minh giao thức của camera này."),
  );
}
async function release(): Promise<void> {}

export const adapter: CameraAdapter = {
  discover: unavailable,
  pair: unavailable,
  connect: unavailable,
  disconnect: release,
  getCapabilities: (): Capabilities => ({
    video: "Unknown",
    audioReceive: "Unknown",
    talk: "Unknown",
    ptz: "Unknown",
    snapshot: "Unknown",
    recording: "Unknown",
    playback: "Unknown",
    events: "Unknown",
    cardUsage: "Unknown",
    quality: "Unknown",
  }),
  startVideo: unavailable,
  stopVideo: release,
  startAudioReceive: unavailable,
  stopAudioReceive: release,
  startTalk: unavailable,
  stopTalk: release,
  movePTZ: unavailable,
  snapshot: unavailable,
  startRecording: unavailable,
  stopRecording: unavailable,
  listRecordings: unavailable,
};
