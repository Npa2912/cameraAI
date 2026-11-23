export const MAX_CAMERA_STORAGE_BYTES = 300_000_000_000;
const GB = 1_000_000_000;
const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;

export function recordingDay(timestampMs: number) {
  return new Date(timestampMs + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayStart(day: string) {
  return Date.parse(day + "T00:00:00+07:00");
}

export function nextDayBoundary(timestampMs: number) {
  return dayStart(recordingDay(timestampMs)) + DAY_MS;
}

export function storageLevel(bytes: number) {
  if (bytes >= MAX_CAMERA_STORAGE_BYTES) return "full";
  if (bytes >= 290 * GB) return "prepare";
  if (bytes >= 270 * GB) return "warning";
  return "normal";
}

export type IndexedVideo = {
  fileId: string;
  bytes: number;
  startMs: number;
  endMs: number;
  verified: boolean;
  protected?: boolean;
  busy?: boolean;
};

/**
 * Requires a complete inventory of verified videos owned by this CamHome root.
 * One day is planned per request. Requery Drive quota and inventory after deletion.
 */
export function planRetention(options: {
  files: readonly IndexedVideo[];
  incomingBytes: number;
  accountFreeBytes: number;
  today: string;
  inventoryComplete: boolean;
}) {
  const { files, incomingBytes, accountFreeBytes, today, inventoryComplete } =
    options;
  const unknown = {
    action: "blocked",
    reason: "unverified_inventory",
  } as const;
  const ids = new Set(files.map((file) => file.fileId));
  if (
    !inventoryComplete ||
    ids.size !== files.length ||
    files.some(
      (file) =>
        !file.verified ||
        !file.fileId ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        !Number.isSafeInteger(file.startMs) ||
        !Number.isSafeInteger(file.endMs) ||
        file.startMs < 0 ||
        file.endMs <= file.startMs ||
        file.endMs > 8.63e15,
    )
  )
    return unknown;
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(incomingBytes) ||
    !Number.isSafeInteger(accountFreeBytes) ||
    incomingBytes <= 0 ||
    accountFreeBytes < 0 ||
    !Number.isFinite(dayStart(today))
  )
    return unknown;
  if (incomingBytes > MAX_CAMERA_STORAGE_BYTES)
    return { action: "blocked", reason: "segment_too_large" } as const;
  if (
    total + incomingBytes <= MAX_CAMERA_STORAGE_BYTES &&
    accountFreeBytes >= incomingBytes
  )
    return { action: "upload" } as const;
  const oldest = files.reduce<string | undefined>((day, file) => {
    const date = recordingDay(file.startMs);
    return !day || date < day ? date : day;
  }, undefined);
  if (!oldest || oldest >= today)
    return { action: "blocked", reason: "no_older_day" } as const;
  const day = files.filter((file) => recordingDay(file.startMs) === oldest);
  if (
    day.some(
      (file) =>
        file.busy ||
        file.protected ||
        file.endMs > nextDayBoundary(file.startMs),
    )
  )
    return { action: "blocked", reason: "oldest_day_locked" } as const;
  return {
    action: "delete-day",
    day: oldest,
    ids: day.map((file) => file.fileId),
  } as const;
}
