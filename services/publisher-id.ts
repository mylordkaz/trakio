import { Storage } from 'expo-sqlite/kv-store';

const PUBLISHER_ID_KEY = 'publisher_id';

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function generatePublisherId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return fallbackUuid();
}

export function getOrCreatePublisherIdSync() {
  const existing = Storage.getItemSync(PUBLISHER_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const publisherId = generatePublisherId();
  Storage.setItemSync(PUBLISHER_ID_KEY, publisherId);
  return publisherId;
}

export async function getOrCreatePublisherId() {
  const existing = await Storage.getItem(PUBLISHER_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const publisherId = generatePublisherId();
  await Storage.setItem(PUBLISHER_ID_KEY, publisherId);
  return publisherId;
}

export { PUBLISHER_ID_KEY };
