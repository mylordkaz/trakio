jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import { Storage } from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import {
  getOrCreatePublisherId,
  getOrCreatePublisherIdSync,
  PUBLISHER_ID_KEY,
} from '../publisher-id';

const storage = Storage as jest.Mocked<typeof Storage>;
const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('publisher id identity', () => {
  it('restores the keychain id after a reinstall wipes kv-store', () => {
    secureStore.getItem.mockReturnValue('keychain-id');
    storage.getItemSync.mockReturnValue(null);

    expect(getOrCreatePublisherIdSync()).toBe('keychain-id');
    expect(storage.setItemSync).toHaveBeenCalledWith(PUBLISHER_ID_KEY, 'keychain-id');
  });

  it('adopts an existing kv-store id into the keychain', () => {
    secureStore.getItem.mockReturnValue(null);
    storage.getItemSync.mockReturnValue('existing-id');

    expect(getOrCreatePublisherIdSync()).toBe('existing-id');
    expect(secureStore.setItem).toHaveBeenCalledWith(PUBLISHER_ID_KEY, 'existing-id');
  });

  it('generates one id and writes it to both stores when neither has one', () => {
    secureStore.getItem.mockReturnValue(null);
    storage.getItemSync.mockReturnValue(null);

    const id = getOrCreatePublisherIdSync();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(secureStore.setItem).toHaveBeenCalledWith(PUBLISHER_ID_KEY, id);
    expect(storage.setItemSync).toHaveBeenCalledWith(PUBLISHER_ID_KEY, id);
  });

  it('falls back to the kv-store id when the keychain throws', () => {
    secureStore.getItem.mockImplementation(() => {
      throw new Error('keychain locked');
    });
    secureStore.setItem.mockImplementation(() => {
      throw new Error('keychain locked');
    });
    storage.getItemSync.mockReturnValue('existing-id');

    expect(getOrCreatePublisherIdSync()).toBe('existing-id');
  });

  it('prefers the keychain id in the async path too', async () => {
    secureStore.getItemAsync.mockResolvedValue('keychain-id');
    storage.getItem.mockResolvedValue('older-kv-id');

    await expect(getOrCreatePublisherId()).resolves.toBe('keychain-id');
    expect(storage.setItem).toHaveBeenCalledWith(PUBLISHER_ID_KEY, 'keychain-id');
  });

  it('adopts the kv-store id asynchronously when the keychain is empty', async () => {
    secureStore.getItemAsync.mockResolvedValue(null);
    storage.getItem.mockResolvedValue('existing-id');

    await expect(getOrCreatePublisherId()).resolves.toBe('existing-id');
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(PUBLISHER_ID_KEY, 'existing-id');
  });
});
