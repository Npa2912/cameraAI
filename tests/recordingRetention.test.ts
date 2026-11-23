import assert from "node:assert/strict";
import test from "node:test";
import {
  dayStart,
  MAX_CAMERA_STORAGE_BYTES,
  planRetention,
  recordingDay,
  storageLevel,
  type IndexedVideo,
} from "../src/recording/retention";

const GB = 1_000_000_000;
const today = "2026-11-23";
const firstDay = "2026-11-01";
const secondDay = "2026-11-02";

function video(fileId: string, day: string, bytes: number): IndexedVideo {
  const startMs = dayStart(day);
  return { fileId, bytes, startMs, endMs: startMs + 300_000, verified: true };
}
function plan(
  files: IndexedVideo[],
  incomingBytes = GB,
  accountFreeBytes = 100 * GB,
  inventoryComplete = true,
) {
  return planRetention({
    files,
    today,
    incomingBytes,
    accountFreeBytes,
    inventoryComplete,
  });
}

test("recognizes decimal cloud-quota thresholds", () => {
  assert.equal(MAX_CAMERA_STORAGE_BYTES, 300 * GB);
  for (const [amount, level] of [
    [100, "normal"],
    [270, "warning"],
    [289, "warning"],
    [290, "prepare"],
    [299, "prepare"],
    [300, "full"],
  ] as const)
    assert.equal(storageLevel(amount * GB), level);
});

test("permits an exact fit then selects only the oldest verified day", () => {
  const files = [
    video("recent", secondDay, 289 * GB),
    video("old-a", firstDay, 5 * GB),
    video("old-b", firstDay, 5 * GB),
  ];
  assert.deepEqual(plan(files), { action: "upload" });
  assert.deepEqual(plan(files, 2 * GB), {
    action: "delete-day",
    day: firstDay,
    ids: ["old-a", "old-b"],
  });
  assert.deepEqual(plan(files.slice(0, 1), 20 * GB), {
    action: "delete-day",
    day: secondDay,
    ids: ["recent"],
  });
});

test("retention protects the current day, important clips and an active reader", () => {
  const current = video("current", today, 300 * GB);
  assert.deepEqual(plan([current]), {
    action: "blocked",
    reason: "no_older_day",
  });
  const oldest = video("old", firstDay, GB);
  for (const flag of ["busy", "protected"] as const) {
    assert.deepEqual(plan([{ ...oldest, [flag]: true }, current]), {
      action: "blocked",
      reason: "oldest_day_locked",
    });
  }
});

test("retention fails closed for stale, unknown and duplicate inventory", () => {
  const oldest = video("old", firstDay, 300 * GB);
  for (const [files, complete] of [
    [[oldest], false],
    [[{ ...oldest, verified: false }], true],
    [[oldest, oldest], true],
  ] as const) {
    assert.deepEqual(plan([...files], GB, 100 * GB, complete), {
      action: "blocked",
      reason: "unverified_inventory",
    });
  }
});

test("account free space is checked independently from camera quota", () => {
  assert.deepEqual(plan([video("old", firstDay, 100 * GB)], GB, 0), {
    action: "delete-day",
    day: firstDay,
    ids: ["old"],
  });
  assert.deepEqual(plan([video("today", today, GB)], GB, 0), {
    action: "blocked",
    reason: "no_older_day",
  });
});

test("Vietnam midnight boundaries prevent deleting a clip shared with a newer day", () => {
  const midnight = dayStart(secondDay);
  assert.equal(recordingDay(midnight - 1), firstDay);
  assert.equal(recordingDay(midnight), secondDay);
  const straddler = {
    ...video("old", firstDay, 300 * GB),
    startMs: midnight - 1,
    endMs: midnight + 60_000,
  };
  assert.deepEqual(plan([straddler]), {
    action: "blocked",
    reason: "oldest_day_locked",
  });
});
