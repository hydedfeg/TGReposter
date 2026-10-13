/**
 * Safe payment-scanner diagnostic taxonomy.
 *
 * Providers may place API keys, URL query strings, wallet addresses or
 * arbitrary request payloads inside thrown messages. Never propagate those
 * messages to browser responses or application logs.
 */
export type CryptoPaymentFailureCode =
  | "RPC_AUTH_REJECTED"
  | "RPC_RATE_LIMITED"
  | "RPC_RANGE_TOO_LARGE"
  | "RPC_TIMEOUT"
  | "RPC_NETWORK_ERROR"
  | "RPC_UPSTREAM_UNAVAILABLE"
  | "RPC_CHAIN_MISMATCH"
  | "RPC_ASSET_INVALID"
  | "RPC_INVALID_RESPONSE"
  | "RPC_REJECTED"
  | "SCAN_FAILED";

const SAFE_ERROR_MESSAGES: Record<CryptoPaymentFailureCode, string> = {
  RPC_AUTH_REJECTED: "Blockchain RPC provider rejected authentication or access.",
  RPC_RATE_LIMITED: "Blockchain RPC provider is rate limiting requests.",
  RPC_RANGE_TOO_LARGE: "Blockchain RPC provider rejected the requested log range.",
  RPC_TIMEOUT: "Blockchain RPC provider request timed out.",
  RPC_NETWORK_ERROR: "Blockchain RPC provider could not be reached.",
  RPC_UPSTREAM_UNAVAILABLE: "Blockchain RPC provider is temporarily unavailable.",
  RPC_CHAIN_MISMATCH: "Configured RPC endpoint returned an unexpected blockchain ID.",
  RPC_ASSET_INVALID: "The USDT asset could not be validated for this network.",
  RPC_INVALID_RESPONSE: "Blockchain RPC provider returned an invalid response.",
  RPC_REJECTED: "Blockchain RPC provider rejected the request.",
  SCAN_FAILED: "Blockchain payment scanner encountered an unexpected error.",
};

/** Classify errors using only controlled constants; never return the source error. */
export function classifyCryptoPaymentFailure(error: unknown): CryptoPaymentFailureCode {
  const source: Record<string, unknown> =
    error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof source.message === "string" ? source.message.toLowerCase().slice(0, 2048) : "";
  const name = typeof source.name === "string" ? source.name : "";
  const code = typeof source.code === "string" || typeof source.code === "number"
    ? String(source.code).toUpperCase() : "";
  const status = typeof source.status === "number" ? source.status : null;

  if (name === "TimeoutError" || name === "AbortError" || /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/.test(code) ||
      /\btimed?\s*out\b|\btimeout\b/.test(message)) return "RPC_TIMEOUT";

  if (status === 401 || status === 403 || /\bhttp (401|403)\b|invalid api.key|unauthorized|access denied|forbidden/i.test(message)) {
    return "RPC_AUTH_REJECTED";
  }

  if (status === 429 || /\bhttp 429\b|rate.limit|too many requests|quota exceeded|request limit exceeded/i.test(message)) {
    return "RPC_RATE_LIMITED";
  }

  if (/too many results|query returned more than|block range|range is too wide|range exceeds|log response size|response size exceeded|limit the query/i.test(message)) {
    return "RPC_RANGE_TOO_LARGE";
  }

  if (/reported chain id|chain id mismatch|wrong chain id/i.test(message)) return "RPC_CHAIN_MISMATCH";

  if (/not a deployed contract|token precision exceeds|jetton precision exceeds|canonical usdt|invalid usdt token identifier/i.test(message)) {
    return "RPC_ASSET_INVALID";
  }

  if (status !== null && status >= 500 && status <= 599 ||
      /\bhttp 5[0-9]{2}\b|bad gateway|service unavailable|gateway timeout/i.test(message)) {
    return "RPC_UPSTREAM_UNAVAILABLE";
  }

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|UND_ERR_CONNECT|EHOSTUNREACH/.test(code) ||
      /fetch failed|network error|socket hang up|dns lookup/i.test(message)) return "RPC_NETWORK_ERROR";

  if (/returned no result|unexpected token|invalid json|invalid evm .* value|invalid ton .* response|unexpected end of json/i.test(message)) {
    return "RPC_INVALID_RESPONSE";
  }

  if (/\brpc\b.*\bfailed\s*:|\brpc request failed\b|center request failed/i.test(message)) {
    return "RPC_REJECTED";
  }

  return "SCAN_FAILED";
}

export function safeCryptoPaymentFailure(error: unknown): {
  errorCode: CryptoPaymentFailureCode;
  error: string;
} {
  const errorCode = classifyCryptoPaymentFailure(error);
  return { errorCode, error: SAFE_ERROR_MESSAGES[errorCode] };
}
