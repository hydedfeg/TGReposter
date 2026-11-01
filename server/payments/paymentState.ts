import type { CryptoPaymentInvoiceStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<
  CryptoPaymentInvoiceStatus,
  ReadonlySet<CryptoPaymentInvoiceStatus>
> = {
  pending: new Set([
    "detected",
    "confirming",
    "paid",
    "expired",
    "cancelled",
    "failed",
  ]),
  detected: new Set([
    "confirming",
    "paid",
    "underpaid",
    "overpaid",
    "failed",
  ]),
  confirming: new Set([
    "paid",
    "underpaid",
    "overpaid",
    "failed",
  ]),
  paid: new Set(),
  expired: new Set(),
  underpaid: new Set(),
  overpaid: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function canTransitionCryptoInvoice(
  from: CryptoPaymentInvoiceStatus,
  to: CryptoPaymentInvoiceStatus
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].has(to);
}

export function assertCryptoInvoiceTransition(
  from: CryptoPaymentInvoiceStatus,
  to: CryptoPaymentInvoiceStatus
): void {
  if (!canTransitionCryptoInvoice(from, to)) {
    throw new Error(
      `Invalid crypto payment invoice transition: ${from} -> ${to}.`
    );
  }
}
