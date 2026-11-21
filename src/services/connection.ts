import {
  CameraError,
  type Camera,
  type CameraAdapter,
} from "../adapters/CameraAdapter";

export function messageFor(error: unknown): string {
  if (!(error instanceof CameraError))
    return "Có lỗi xảy ra. Vui lòng thử lại.";
  switch (error.code) {
    case "offline":
      return "Camera ngoại tuyến. Kiểm tra camera và Wi-Fi.";
    case "auth":
      return "Xác thực thất bại. Kiểm tra thông tin camera.";
    case "timeout":
      return "Camera không phản hồi trong thời gian chờ.";
    default:
      return error.message;
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error("Connection cancelled");
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Connection cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function connectWithRetry(
  adapter: Pick<CameraAdapter, "connect">,
  camera: Camera,
  signal: AbortSignal,
  delay = wait,
) {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new Error("Connection cancelled");
    try {
      await adapter.connect(camera, signal);
      if (signal.aborted) throw new Error("Connection cancelled");
      return;
    } catch (error) {
      const temporary =
        error instanceof CameraError &&
        ["offline", "timeout"].includes(error.code);
      if (signal.aborted || !temporary || attempt >= 3) throw error;
      await delay(500 * 2 ** attempt, signal);
    }
  }
}
