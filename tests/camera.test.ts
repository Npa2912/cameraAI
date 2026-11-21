import assert from "node:assert/strict";
import { test } from "node:test";
import { CameraError } from "../src/adapters/CameraAdapter";
import { adapter } from "../src/adapters/UnverifiedAdapter";
import { connectWithRetry, messageFor } from "../src/services/connection";
import { parseAddress, readLabel } from "../src/services/deviceInput";

const camera = { id: "fixture", name: "Test fixture" };

test("manual address parser accepts IPv4 and rejects URLs and invalid octets", () => {
  assert.equal(parseAddress(" 192.0.2.12 "), "192.0.2.12");
  for (const value of [
    "127.0.0.1",
    "224.0.0.1",
    "192.0.2.256",
    "192.00.2.1",
    "https://192.0.2.12/",
    "user@host",
    "",
  ]) {
    assert.equal(parseAddress(value), undefined);
  }
});

test("QR label is parsed as opaque text", () => {
  assert.equal(readLabel("  fixture-label "), "fixture-label");
  assert.equal(readLabel("invalid\u0000label"), undefined);
  assert.equal(readLabel("x".repeat(1025)), undefined);
});

test("unverified adapter reports unknown capabilities and rejects device operations", async () => {
  const signal = new AbortController().signal;
  assert.ok(
    Object.values(adapter.getCapabilities()).every(
      (value) => value === "Unknown",
    ),
  );
  for (const operation of [
    () => adapter.connect(camera, signal),
    () => adapter.discover(signal),
    () => adapter.pair(camera, signal),
    () => adapter.startVideo(),
    () => adapter.startAudioReceive(),
    () => adapter.startTalk(),
    () => adapter.movePTZ("left"),
    () => adapter.startRecording(),
    () => adapter.stopRecording(),
    () => adapter.snapshot(),
    () => adapter.listRecordings(),
  ]) {
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof CameraError && error.code === "unverified",
    );
  }
  await adapter.disconnect();
});

test("mock transport recovers after Wi-Fi loss and timeout", async () => {
  const delays: number[] = [];
  let attempts = 0;
  await connectWithRetry(
    {
      async connect() {
        attempts++;
        if (attempts === 1) throw new CameraError("offline", "");
        if (attempts === 2) throw new CameraError("timeout", "");
      },
    },
    camera,
    new AbortController().signal,
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("mock transport bounds retries when camera stays offline", async () => {
  const delays: number[] = [];
  const offline = new CameraError("offline", "");
  await assert.rejects(
    connectWithRetry(
      {
        async connect() {
          throw offline;
        },
      },
      camera,
      new AbortController().signal,
      async (ms) => {
        delays.push(ms);
      },
    ),
    offline,
  );
  assert.deepEqual(delays, [500, 1000, 2000]);
  assert.match(messageFor(offline), /ngoại tuyến/);
});

test("mock transport does not retry authentication errors", async () => {
  const auth = new CameraError("auth", "");
  await assert.rejects(
    connectWithRetry(
      {
        async connect() {
          throw auth;
        },
      },
      camera,
      new AbortController().signal,
      async () => {
        assert.fail("Unexpected retry");
      },
    ),
    auth,
  );
  assert.match(messageFor(auth), /Xác thực thất bại/);
});

test("mock transport stops connection retries after navigation cancellation", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const pending = connectWithRetry(
    {
      async connect() {
        attempts++;
        throw new CameraError("offline", "");
      },
    },
    camera,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending);
  assert.equal(attempts, 1);
});
