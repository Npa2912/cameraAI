import { parseAddress } from "../services/deviceInput";

export type PreviewFrame = {
  status: "connecting" | "online" | "offline" | "error";
  width?: number;
  height?: number;
  fps?: number;
  ptz?: boolean;
  sequence?: number;
  image?: string;
  message?: string;
};

export function bridgeOrigin(value: string): string | undefined {
  const match = /^(\d+\.\d+\.\d+\.\d+):(\d{1,5})$/.exec(value.trim());
  if (!match || (match[1] !== "127.0.0.1" && !parseAddress(match[1]))) return;
  const [first, second] = match[1].split(".").map(Number);
  const port = Number(match[2]);
  if (
    !port ||
    port > 65535 ||
    !(
      match[1] === "127.0.0.1" ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
  )
    return;
  return "http://" + match[1] + ":" + port;
}

export type PtzDirection = "up" | "down" | "left" | "right";

export async function bridgeRequest<T>(
  address: string,
  code: string,
  viewer: string,
  action: "frame" | "disconnect" | "snapshot" | "move",
  sequence?: number,
  signal?: AbortSignal,
  direction?: PtzDirection,
): Promise<T> {
  const origin = bridgeOrigin(address);
  if (!origin) throw new Error("Địa chỉ bridge không hợp lệ.");
  const request = new AbortController();
  const abort = () => request.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 2500);
  try {
    const response = await fetch(origin + "/" + action, {
      method: "POST",
      redirect: "error",
      signal: request.signal,
      headers: {
        Authorization: "Bearer " + code,
        "X-CamHome-Viewer": viewer,
        "X-CamHome-Frame": String(sequence ?? -1),
        ...(direction && { "X-CamHome-Direction": direction }),
      },
    });
    if (response.status === 401) throw new BridgeAccessError();
    if (!response.ok) throw new Error("Bridge không thực hiện được yêu cầu.");
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export class BridgeAccessError extends Error {}
