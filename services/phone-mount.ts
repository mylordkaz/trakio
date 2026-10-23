import { Storage } from 'expo-sqlite/kv-store';
import type { PhoneMount, Vec3 } from '@/telemetry/car-frame-g';

const PHONE_MOUNT_KEY = 'phone_mount_v1';

function isVec3(value: unknown): value is Vec3 {
  const v = value as Vec3 | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

export function parsePhoneMount(raw: string | null): PhoneMount | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<PhoneMount>;
    if (isVec3(value.down) && isVec3(value.forwardHint) && Number.isFinite(value.mountYawRad)) {
      return { down: value.down, forwardHint: value.forwardHint, mountYawRad: value.mountYawRad as number };
    }
  } catch {
    // A corrupt value means relearning, nothing worse.
  }
  return null;
}

export async function loadPhoneMount(): Promise<PhoneMount | null> {
  try {
    return parsePhoneMount(await Storage.getItem(PHONE_MOUNT_KEY));
  } catch {
    return null;
  }
}

export async function savePhoneMount(mount: PhoneMount): Promise<void> {
  try {
    await Storage.setItem(PHONE_MOUNT_KEY, JSON.stringify(mount));
  } catch {
    // Best-effort: the next session learns the mount again.
  }
}

export async function clearPhoneMount(): Promise<void> {
  try {
    await Storage.removeItem(PHONE_MOUNT_KEY);
  } catch {
    // Best-effort, like saving.
  }
}
