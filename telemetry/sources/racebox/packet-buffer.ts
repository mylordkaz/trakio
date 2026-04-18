import {
  SYNC_BYTE_1,
  SYNC_BYTE_2,
  HEADER_LENGTH,
  CHECKSUM_LENGTH,
} from '@/telemetry/sources/racebox/constants';

export type PacketBufferCallbacks = {
  onPacket: (messageClass: number, messageId: number, payload: Uint8Array) => void;
  onError?: (error: Error) => void;
};

export function createPacketBuffer(callbacks: PacketBufferCallbacks) {
  let buffer = new Uint8Array(0);

  function verifyChecksum(
    data: Uint8Array,
    start: number,
    end: number,
    ckA: number,
    ckB: number
  ): boolean {
    let a = 0;
    let b = 0;
    for (let i = start; i < end; i++) {
      a = (a + data[i]) & 0xff;
      b = (b + a) & 0xff;
    }
    return a === ckA && b === ckB;
  }

  function findSyncOffset(data: Uint8Array, from: number): number {
    for (let i = from; i < data.length - 1; i++) {
      if (data[i] === SYNC_BYTE_1 && data[i + 1] === SYNC_BYTE_2) {
        return i;
      }
    }
    return -1;
  }

  function append(data: Uint8Array): void {
    const merged = new Uint8Array(buffer.length + data.length);
    merged.set(buffer);
    merged.set(data, buffer.length);
    buffer = merged;

    processBuffer();
  }

  function processBuffer(): void {
    while (buffer.length >= HEADER_LENGTH) {
      const syncOffset = findSyncOffset(buffer, 0);
      if (syncOffset < 0) {
        buffer = new Uint8Array(0);
        return;
      }

      if (syncOffset > 0) {
        buffer = buffer.slice(syncOffset);
      }

      if (buffer.length < HEADER_LENGTH) {
        return;
      }

      const payloadLength = buffer[4] | (buffer[5] << 8);

      if (payloadLength > 504) {
        callbacks.onError?.(new Error(`Invalid payload length: ${payloadLength}`));
        buffer = buffer.slice(2);
        continue;
      }

      const packetLength = HEADER_LENGTH + payloadLength + CHECKSUM_LENGTH;

      if (buffer.length < packetLength) {
        return;
      }

      const checksumStart = 2;
      const checksumEnd = HEADER_LENGTH + payloadLength;
      const ckA = buffer[packetLength - 2];
      const ckB = buffer[packetLength - 1];

      if (!verifyChecksum(buffer, checksumStart, checksumEnd, ckA, ckB)) {
        callbacks.onError?.(new Error('Checksum mismatch'));
        buffer = buffer.slice(2);
        continue;
      }

      const messageClass = buffer[2];
      const messageId = buffer[3];
      const payload = buffer.slice(HEADER_LENGTH, HEADER_LENGTH + payloadLength);

      callbacks.onPacket(messageClass, messageId, payload);

      buffer = buffer.slice(packetLength);
    }
  }

  function reset(): void {
    buffer = new Uint8Array(0);
  }

  return { append, reset };
}
