import {
  NOTIFICATION_FRAGMENT_LENGTH,
  GNSS_RECORD_LENGTH,
  GSV_PADDED_RECORD_LENGTH,
  GSV_PACKET_LENGTHS,
  MAX_UPDATE_LENGTH,
} from '@/telemetry/sources/qstarz/constants';

// With no checksum, the exact completed lengths the protocol defines (58, or
// 60 padded + one GSV packet) are part of the framing validation.
const VALID_UPDATE_LENGTHS = new Set([
  GNSS_RECORD_LENGTH,
  ...GSV_PACKET_LENGTHS.map((gsvLength) => GSV_PADDED_RECORD_LENGTH + gsvLength),
]);

export type QstarzPacketBufferCallbacks = {
  onRecord: (record: Uint8Array) => void;
  onError?: (error: Error) => void;
};

// The protocol has no sync bytes or checksum: an update is delimited by
// notification lengths alone. Every 20-byte notification extends the current
// update; the first notification of any other length completes it.
export function createQstarzPacketBuffer(callbacks: QstarzPacketBufferCallbacks) {
  let fragments: Uint8Array[] = [];
  let pendingLength = 0;

  function drainPending(): Uint8Array {
    const update = new Uint8Array(pendingLength);
    let offset = 0;
    for (const fragment of fragments) {
      update.set(fragment, offset);
      offset += fragment.length;
    }
    fragments = [];
    pendingLength = 0;
    return update;
  }

  function completeUpdate(): void {
    const update = drainPending();

    // Off-length assemblies — subscribing mid-update, lost alignment, or a
    // malformed oversize payload — are dropped; the next non-20-byte
    // notification restores framing by itself.
    if (!VALID_UPDATE_LENGTHS.has(update.length)) {
      return;
    }

    if (update.length === GNSS_RECORD_LENGTH) {
      callbacks.onRecord(update);
      return;
    }

    // Padded form: GNSS record, two zero marker bytes, then GSV satellite
    // data (not used). Non-zero marker bytes mean misalignment.
    if (update[GNSS_RECORD_LENGTH] === 0 && update[GNSS_RECORD_LENGTH + 1] === 0) {
      callbacks.onRecord(update.slice(0, GNSS_RECORD_LENGTH));
    }
  }

  function append(data: Uint8Array): void {
    fragments.push(data);
    pendingLength += data.length;

    if (data.length !== NOTIFICATION_FRAGMENT_LENGTH) {
      completeUpdate();
      return;
    }

    if (pendingLength > MAX_UPDATE_LENGTH) {
      callbacks.onError?.(
        new Error(`Update exceeded ${MAX_UPDATE_LENGTH} bytes without a terminator`)
      );
      fragments = [];
      pendingLength = 0;
    }
  }

  function reset(): void {
    fragments = [];
    pendingLength = 0;
  }

  return { append, reset };
}
