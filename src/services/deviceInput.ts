export function parseAddress(input: string): string | undefined {
  const address = input.trim();
  const parts = address.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255,
    )
  ) {
    return undefined;
  }
  const first = Number(parts[0]);
  return first > 0 && first < 224 && first !== 127 ? address : undefined;
}

/** Label payloads are opaque. Never open QR URLs or treat payloads as credentials. */
export function readLabel(input: string): string | undefined {
  const label = input.trim();
  return label && label.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(label)
    ? label
    : undefined;
}

export class DuplicateDeviceError extends Error {}
