import sdk from "@farcaster/miniapp-sdk";

/**
 * Get auth headers for authenticated API calls
 * Returns headers with Bearer token if available
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const { token } = await sdk.quickAuth.getToken();
    if (token) {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };
    }
  } catch (error) {
    console.error("Failed to get auth token:", error);
  }
  return { "Content-Type": "application/json" };
}

/**
 * Make an authenticated POST request
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
}

/**
 * Make an authenticated POST request with JSON body
 */
export async function authPost<T>(
  url: string,
  body: T
): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
