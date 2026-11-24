/**
 * Small wrapper around fetch() for calling our own API from the browser.
 */

/**
 * Sends JSON to an API route and returns the JSON response.
 * Throws an Error with the server's message when the request fails, and
 * sends the browser to the login page when the session has expired.
 */
export async function sendJson<T = unknown>(url: string, body: unknown = {}, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.href = "/login";
  }
  if (!response.ok) {
    throw new Error(data.error || "Diçka shkoi keq.");
  }
  return data as T;
}
