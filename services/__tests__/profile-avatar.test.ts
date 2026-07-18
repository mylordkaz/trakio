const mockCopiedFiles: { source: string; destination: string }[] = [];

jest.mock('expo-file-system', () => {
  const join = (...parts: ({ uri?: string } | string)[]) =>
    parts.reduce<string>((path, part, index) => {
      const value = typeof part === 'string' ? part : part.uri ?? '';
      return index === 0
        ? value.replace(/\/$/, '')
        : `${path}/${value.replace(/^\/+/, '')}`;
    }, '');

  class MockDirectory {
    uri: string;
    exists = true;

    constructor(...parts: ({ uri?: string } | string)[]) {
      this.uri = join(...parts);
    }

    create() {}
    list() { return []; }
  }

  class MockFile {
    uri: string;
    name: string;

    constructor(...parts: ({ uri?: string } | string)[]) {
      this.uri = join(...parts);
      this.name = this.uri.split('/').at(-1) ?? '';
    }

    copy(destination: MockFile) {
      mockCopiedFiles.push({ source: this.uri, destination: destination.uri });
    }

    delete() {}
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      document: new MockDirectory('file:///container/Documents'),
      relative: (from: MockDirectory, to: string) => {
        const prefix = `${from.uri}/`;
        return to.startsWith(prefix) ? to.slice(prefix.length) : `../${to}`;
      },
    },
  };
});

import { persistProfileAvatar, resolveProfileAvatarUri } from '../profile-avatar';

describe('profile avatar persistence', () => {
  beforeEach(() => {
    mockCopiedFiles.length = 0;
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a stable database reference against the current document directory', () => {
    expect(resolveProfileAvatarUri('trakio-avatar:avatar-1.jpg')).toBe(
      'file:///container/Documents/profile-avatars/avatar-1.jpg',
    );
  });

  it('leaves legacy image URIs readable until the profile is saved', () => {
    const legacyUri = 'file:///old-container/Library/Caches/image-picker/photo.jpg';
    expect(resolveProfileAvatarUri(legacyUri)).toBe(legacyUri);
  });

  it('copies a picker image into Documents and returns a stable reference', () => {
    const reference = persistProfileAvatar('file:///tmp/image-picker/photo.png');

    expect(reference).toMatch(/^trakio-avatar:avatar-1234-[a-z0-9]+\.png$/);
    expect(mockCopiedFiles).toEqual([
      {
        source: 'file:///tmp/image-picker/photo.png',
        destination: expect.stringContaining('file:///container/Documents/profile-avatars/avatar-1234-'),
      },
    ]);
  });

  it('does not recopy an avatar that is already in managed storage', () => {
    expect(
      persistProfileAvatar('file:///container/Documents/profile-avatars/avatar-1.jpg'),
    ).toBe('trakio-avatar:avatar-1.jpg');
    expect(mockCopiedFiles).toHaveLength(0);
  });
});
