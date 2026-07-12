import { cleanFeedbackRequest, submitFeedback } from '../feedback';

describe('feedback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cleans user input while preserving message line breaks', () => {
    expect(cleanFeedbackRequest({
      name: '  Alex\nDriver ',
      message: '  First line\r\nSecond\u0000 line  ',
      publisherId: ' local-user ',
      appVersion: null,
      locale: '',
    })).toEqual({
      name: 'Alex Driver',
      message: 'First line\nSecond line',
      publisherId: 'local-user',
      appVersion: null,
      locale: 'unknown',
    });
  });

  it('posts feedback to the Trakio API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, feedbackId: 'feedback-1' }),
    } as Response);

    await expect(submitFeedback({
      name: 'Alex',
      message: 'Please add an export button.',
      publisherId: 'publisher-1',
      appVersion: '1.2.1',
      locale: 'en',
    })).resolves.toEqual({ ok: true, feedbackId: 'feedback-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://trakio-d1.mylord.workers.dev/feedback',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects unsuccessful API responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);

    await expect(submitFeedback({
      name: 'Alex',
      message: 'Hello',
      publisherId: 'publisher-1',
      appVersion: '1.2.1',
      locale: 'en',
    })).rejects.toThrow('Feedback request failed with 429');
  });
});
