import { Storage } from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';

const PUBLISHER_ID_KEY = 'publisher_id';

// The publisher id is the user's entire leaderboard identity. The keychain
// copy survives app deletion; the kv-store copy keeps reads working when the
// keychain is unavailable. Reads prefer the keychain, adopt an existing
// kv-store id into it, and only generate a fresh id when neither store has one.

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

function normalizeId(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

function readKeychainSync(): string | null {
  try {
    return normalizeId(SecureStore.getItem(PUBLISHER_ID_KEY));
  } catch {
    return null;
  }
}

function writeKeychainSync(publisherId: string) {
  try {
    SecureStore.setItem(PUBLISHER_ID_KEY, publisherId);
  } catch {
    // kv-store still holds the id; the keychain copy retries on a later read.
  }
}

async function readKeychain(): Promise<string | null> {
  try {
    return normalizeId(await SecureStore.getItemAsync(PUBLISHER_ID_KEY));
  } catch {
    return null;
  }
}

async function writeKeychain(publisherId: string) {
  try {
    await SecureStore.setItemAsync(PUBLISHER_ID_KEY, publisherId);
  } catch {
    // kv-store still holds the id; the keychain copy retries on a later read.
  }
}

export function getOrCreatePublisherIdSync() {
  const keychainId = readKeychainSync();
  const storedId = normalizeId(Storage.getItemSync(PUBLISHER_ID_KEY));

  if (keychainId) {
    if (storedId !== keychainId) {
      Storage.setItemSync(PUBLISHER_ID_KEY, keychainId);
    }
    return keychainId;
  }

  if (storedId) {
    writeKeychainSync(storedId);
    return storedId;
  }

  const publisherId = generatePublisherId();
  writeKeychainSync(publisherId);
  Storage.setItemSync(PUBLISHER_ID_KEY, publisherId);
  return publisherId;
}

export async function getOrCreatePublisherId() {
  const keychainId = await readKeychain();
  const storedId = normalizeId(await Storage.getItem(PUBLISHER_ID_KEY));

  if (keychainId) {
    if (storedId !== keychainId) {
      await Storage.setItem(PUBLISHER_ID_KEY, keychainId);
    }
    return keychainId;
  }

  if (storedId) {
    await writeKeychain(storedId);
    return storedId;
  }

  const publisherId = generatePublisherId();
  await writeKeychain(publisherId);
  await Storage.setItem(PUBLISHER_ID_KEY, publisherId);
  return publisherId;
}

export { PUBLISHER_ID_KEY };
