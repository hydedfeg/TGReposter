/**
 * Safe JSON parser for fetch API responses.
 * Detects HTML error pages (e.g. from gateway timeouts, proxy errors, or server restarts)
 * and turns them into descriptive, user-friendly error messages.
 */
export async function safeResponseJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type");
  
  if (contentType && contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (e: any) {
      throw new Error("Failed to parse JSON response. The server payload may be corrupted.");
    }
  }

  const text = await response.text();
  
  // Check if it's an HTML page (standard gateway fallback / SPA router fallback)
  if (text.includes("<!doctype") || text.includes("<html")) {
    throw new Error(`Server returned an HTML page (Status ${response.status}). The background service might be offline or currently restarting. Please try again in a few seconds.`);
  }

  throw new Error(text || `Server returned a non-JSON response with HTTP status ${response.status}.`);
}
