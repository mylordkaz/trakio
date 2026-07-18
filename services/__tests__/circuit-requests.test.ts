import { cleanCircuitRequest, submitCircuitRequest } from '../circuit-requests';

describe('circuit requests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes control characters and bounds request metadata', () => {
    expect(cleanCircuitRequest({
      circuitName: '  Mount\n\u0000 Panorama   Circuit  ',
      publisherId: ' local-user ',
      appVersion: null,
      locale: '',
    })).toEqual({
      circuitName: 'Mount Panorama Circuit',
      publisherId: 'local-user',
      appVersion: null,
      locale: 'unknown',
    });
  });

  it('posts the request to the Trakio API without opening another app', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: 'request-1', duplicate: false }),
    } as Response);

    await expect(submitCircuitRequest({
      circuitName: 'Circuit de Spa-Francorchamps',
      publisherId: 'publisher-1',
      appVersion: '1.2.1',
      locale: 'en-BE',
    })).resolves.toEqual({ ok: true, requestId: 'request-1', duplicate: false });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://trakio-d1.mylord.workers.dev/circuit-requests',
      expect.objectContaining({ method: 'POST' }),
    );
    const options = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({
      circuitName: 'Circuit de Spa-Francorchamps',
      publisherId: 'publisher-1',
      appVersion: '1.2.1',
      locale: 'en-BE',
    });
  });

  it('rejects unsuccessful API responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);

    await expect(submitCircuitRequest({
      circuitName: 'Spa',
      publisherId: 'publisher-1',
      appVersion: '1.2.1',
      locale: 'en',
    })).rejects.toThrow('Circuit request failed with 429');
  });
});
