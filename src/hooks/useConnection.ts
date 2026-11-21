import { useEffect, useState } from "react";
import type { Camera } from "../adapters/CameraAdapter";
import { adapter } from "../adapters/UnverifiedAdapter";
import { connectWithRetry, messageFor } from "../services/connection";

type Connection = {
  status: "connecting" | "connected" | "error";
  message?: string;
};
export function useConnection(camera: Camera, attempt: number) {
  const [connection, setConnection] = useState<Connection>({
    status: "connecting",
  });
  useEffect(() => {
    const controller = new AbortController();
    setConnection({ status: "connecting" });
    void connectWithRetry(adapter, camera, controller.signal).then(
      () => {
        if (!controller.signal.aborted) setConnection({ status: "connected" });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setConnection({ status: "error", message: messageFor(error) });
      },
    );
    return () => {
      controller.abort();
      void adapter.disconnect().catch(() => undefined);
    };
  }, [camera, attempt]);
  return connection;
}
