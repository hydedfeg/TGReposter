-- Zero-value token Transfer events can be emitted on EVM and must not
-- block the scanner. Invoice and owned transaction amounts remain > 0.
alter table public.crypto_payment_unassigned_transfers
  drop constraint crypto_unassigned_amount_check;
alter table public.crypto_payment_unassigned_transfers
  add constraint crypto_unassigned_amount_check check (amount >= 0);
comment on constraint crypto_unassigned_amount_check on public.crypto_payment_unassigned_transfers is
  'Allow zero-value token Transfer observations in the platform review ledger so spam cannot stop a payment scanner. Invoices still require strictly positive amounts.';
