/** Where the self-hosted server answers: the same origin as the app, so a
 *  build works wherever it is served from, and the session cookie is never
 *  sent anywhere else. */
export const API = '/api/v1'

/** A call to the self-hosted server. Anything but a 2xx throws, with the
 *  server's own message when it gave one. */
export async function api<T>(
  method: string,
  path: string,
  { body, signal }: { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    signal,
  })
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) {
    throw Object.assign(new Error(data?.error ?? `The server answered ${response.status}`), {
      status: response.status,
    })
  }
  return data as T
}
