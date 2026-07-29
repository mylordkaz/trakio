import { checkForAppUpdate, compareVersions } from '../app-update';

function createFetchMock({
  storeVersion,
  minimumVersion,
  releaseNotes = 'New circuits are available.',
}: {
  storeVersion: string;
  minimumVersion?: string;
  releaseNotes?: string;
}) {
  return jest.fn(async (input: string | URL | Request) => {
    const url = String(input);

    if (url.startsWith('https://itunes.apple.com/lookup')) {
      return {
        ok: true,
        json: async () => ({
          results: [{
            version: storeVersion,
            releaseNotes,
            trackViewUrl: 'https://apps.apple.com/jp/app/trakio/id6760278416',
          }],
        }),
      } as Response;
    }

    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return {
        ok: minimumVersion !== undefined,
        json: async () => ({
          ios: { minimumSupportedVersion: minimumVersion },
        }),
      } as Response;
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('app update checks', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.3.1', '1.3')).toBe(1);
    expect(compareVersions('1.10', '1.9.9')).toBe(1);
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
    expect(compareVersions('1.2.9', '1.3')).toBe(-1);
    expect(compareVersions('not-a-version', '1.3')).toBeNull();
  });

  it('returns an optional update when the installed version remains supported', async () => {
    const fetcher = createFetchMock({
      storeVersion: '1.3.1',
      minimumVersion: '1.3',
    });

    await expect(checkForAppUpdate({
      installedVersion: '1.3',
      locale: 'ja-JP',
      fetcher: fetcher as typeof fetch,
    })).resolves.toEqual({
      latestVersion: '1.3.1',
      mandatory: false,
      releaseNotes: 'New circuits are available.',
      storeUrl: 'https://apps.apple.com/jp/app/trakio/id6760278416',
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('country=jp&lang=ja_jp'),
    );
  });

  it('returns a mandatory update below the remote minimum version', async () => {
    const fetcher = createFetchMock({
      storeVersion: '1.4',
      minimumVersion: '1.4.0',
    });

    await expect(checkForAppUpdate({
      installedVersion: '1.3.1',
      locale: 'en-US',
      fetcher: fetcher as typeof fetch,
    })).resolves.toEqual(expect.objectContaining({
      latestVersion: '1.4',
      mandatory: true,
    }));
  });

  it('does not enforce a minimum version that is not yet on the App Store', async () => {
    const fetcher = createFetchMock({
      storeVersion: '1.3.1',
      minimumVersion: '1.4',
    });

    await expect(checkForAppUpdate({
      installedVersion: '1.3',
      locale: 'en-US',
      fetcher: fetcher as typeof fetch,
    })).resolves.toEqual(expect.objectContaining({
      latestVersion: '1.3.1',
      mandatory: false,
    }));
  });

  it('still returns an optional update if the policy cannot be loaded', async () => {
    const fetcher = createFetchMock({ storeVersion: '1.3.1' });

    await expect(checkForAppUpdate({
      installedVersion: '1.3',
      locale: 'en-US',
      fetcher: fetcher as typeof fetch,
    })).resolves.toEqual(expect.objectContaining({
      latestVersion: '1.3.1',
      mandatory: false,
    }));
  });

  it('returns nothing when the installed release is current or newer', async () => {
    const fetcher = createFetchMock({
      storeVersion: '1.3.1',
      minimumVersion: '1.3',
    });

    await expect(checkForAppUpdate({
      installedVersion: '1.3.1',
      locale: 'en-US',
      fetcher: fetcher as typeof fetch,
    })).resolves.toBeNull();
  });
});
