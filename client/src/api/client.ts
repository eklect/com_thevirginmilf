/**
 * Thin fetch wrapper for the site's API. Copied from MAP's portal.
 *
 * `credentials: 'include'` on every call: authentication is the httpOnly session
 * cookie, so there is no token for JavaScript to hold — and nothing for an XSS bug
 * to steal. Every path is relative (`/api/...`); nginx makes it same-origin.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response), payload);
  }

  return payload as T;
}

/** Nest's ValidationPipe returns `message` as an array; flatten it for display. */
function extractMessage(payload: unknown, response: Response): string {
  const message = (payload as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return `Request failed (${response.status})`;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** The message to show a person for a caught error. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.';
}
