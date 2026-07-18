import { Directory, File, Paths } from 'expo-file-system';

const AVATAR_DIRECTORY = 'profile-avatars';
const AVATAR_REFERENCE_PREFIX = 'trakio-avatar:';
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

function avatarDirectory(): Directory {
  return new Directory(Paths.document, AVATAR_DIRECTORY);
}

function filenameFromReference(reference: string): string | null {
  if (!reference.startsWith(AVATAR_REFERENCE_PREFIX)) return null;

  const filename = reference.slice(AVATAR_REFERENCE_PREFIX.length);
  return SAFE_FILENAME.test(filename) ? filename : null;
}

function extensionFromUri(uri: string): string {
  const match = uri.split(/[?#]/, 1)[0].match(/\.([a-zA-Z0-9]{1,5})$/);
  const extension = match?.[1].toLowerCase();
  return extension && ['heic', 'heif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
    ? extension
    : 'jpg';
}

export function resolveProfileAvatarUri(storedUri: string | null): string | null {
  if (!storedUri) return null;

  const filename = filenameFromReference(storedUri);
  return filename ? new File(avatarDirectory(), filename).uri : storedUri;
}

export function persistProfileAvatar(sourceUri: string | null): string | null {
  if (!sourceUri) return null;

  const directory = avatarDirectory();
  const relativePath = Paths.relative(directory, sourceUri);
  if (SAFE_FILENAME.test(relativePath)) {
    return `${AVATAR_REFERENCE_PREFIX}${relativePath}`;
  }

  directory.create({ idempotent: true, intermediates: true });
  const filename = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionFromUri(sourceUri)}`;
  new File(sourceUri).copy(new File(directory, filename));

  return `${AVATAR_REFERENCE_PREFIX}${filename}`;
}

export function cleanupProfileAvatars(activeReference: string | null): void {
  try {
    const directory = avatarDirectory();
    if (!directory.exists) return;

    const activeFilename = activeReference ? filenameFromReference(activeReference) : null;
    for (const entry of directory.list()) {
      if (entry instanceof File && entry.name !== activeFilename) {
        entry.delete();
      }
    }
  } catch {
    // Orphaned avatars can be cleaned up after a later successful save.
  }
}
