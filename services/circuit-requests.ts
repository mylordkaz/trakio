const TRAKIO_API_BASE_URL = 'https://trakio-d1.mylord.workers.dev';

export const CIRCUIT_NAME_MAX_LENGTH = 100;

export type CircuitRequest = {
  circuitName: string;
  publisherId: string;
  appVersion: string | null;
  locale: string;
};

type CircuitRequestResponse = {
  ok: boolean;
  requestId: string;
  duplicate: boolean;
};

function sanitizeLine(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function cleanCircuitRequest(request: CircuitRequest): CircuitRequest {
  return {
    circuitName: sanitizeLine(request.circuitName, CIRCUIT_NAME_MAX_LENGTH),
    publisherId: sanitizeLine(request.publisherId, 64),
    appVersion: request.appVersion
      ? sanitizeLine(request.appVersion, 30) || null
      : null,
    locale: sanitizeLine(request.locale, 20) || 'unknown',
  };
}

export async function submitCircuitRequest(
  request: CircuitRequest,
): Promise<CircuitRequestResponse> {
  const response = await fetch(`${TRAKIO_API_BASE_URL}/circuit-requests`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(cleanCircuitRequest(request)),
  });

  if (!response.ok) {
    throw new Error(`Circuit request failed with ${response.status}`);
  }

  return response.json() as Promise<CircuitRequestResponse>;
}
