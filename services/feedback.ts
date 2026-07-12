const TRAKIO_API_BASE_URL = 'https://trakio-d1.mylord.workers.dev';

export const FEEDBACK_NAME_MAX_LENGTH = 80;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

export type FeedbackRequest = {
  name: string;
  message: string;
  publisherId: string;
  appVersion: string | null;
  locale: string;
};

type FeedbackResponse = {
  ok: boolean;
  feedbackId: string;
};

function sanitizeLine(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMessage(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, FEEDBACK_MESSAGE_MAX_LENGTH);
}

export function cleanFeedbackRequest(request: FeedbackRequest): FeedbackRequest {
  return {
    name: sanitizeLine(request.name, FEEDBACK_NAME_MAX_LENGTH),
    message: sanitizeMessage(request.message),
    publisherId: sanitizeLine(request.publisherId, 64),
    appVersion: request.appVersion
      ? sanitizeLine(request.appVersion, 30) || null
      : null,
    locale: sanitizeLine(request.locale, 20) || 'unknown',
  };
}

export async function submitFeedback(
  request: FeedbackRequest,
): Promise<FeedbackResponse> {
  const response = await fetch(`${TRAKIO_API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(cleanFeedbackRequest(request)),
  });

  if (!response.ok) {
    throw new Error(`Feedback request failed with ${response.status}`);
  }

  return response.json() as Promise<FeedbackResponse>;
}
