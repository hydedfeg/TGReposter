-- ARCHIVED HISTORICAL FIXTURE: DO NOT EXECUTE AS A CURRENT ACCEPTANCE GATE.
-- Original Phase 10 fixture used t.confirmations > 0; current BSC billing finality
-- requires the server-configured threshold (120 on staging at the last audit).
-- The old positive-confirmation predicate is NOT evidence of payable finality.
-- Retained for audit provenance ONLY, outside the executable tests/sql directory.
-- Source: PR #44, tests/sql/phase10_staging_billing_acceptance.sql.

-- Phase 10 staging-only acceptance smoke test.
-- Intentionally rolls back every synthetic invoice and transaction.
-- No blockchain calls, catalog publishing, or paid entitlement changes.
BEGIN;
DO $phase10$
DECLARE
  fixture_invoice_uuid uuid;
  chain_event_id uuid;
  paid boolean;
  owner text := 'legacy:phase10-fixture-alice';
  other_owner text := 'legacy:phase10-fixture-bob';
  transfer_hash text := 'synthetic-phase10-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.crypto_payment_invoices
    (owner_principal,asset_code,network,requested_amount,expected_amount,
     receiving_address,token_identifier,status,confirmed_at,expires_at)
  VALUES
    (owner,'USDT','bsc',16.5,16.500001,'0xphase10receiver',
     '0xphase10token','paid',now(),now()+interval '1 hour')
  RETURNING id INTO fixture_invoice_uuid;

  INSERT INTO public.crypto_payment_transactions
    (owner_principal,invoice_id,network,tx_hash,event_index,
     token_identifier,to_address,amount,confirmations,status,confirmed_at)
  VALUES
    (owner,fixture_invoice_uuid,'bsc',transfer_hash,'0','0xwrongtoken',
     '0xphase10receiver',16.500001,15,'confirmed',now())
  RETURNING id INTO chain_event_id;

  SELECT EXISTS(
    SELECT 1 FROM public.crypto_payment_transactions t
    JOIN public.crypto_payment_invoices i
      ON t.owner_principal=i.owner_principal AND t.invoice_id=i.id
    WHERE t.owner_principal=owner AND t.invoice_id=fixture_invoice_uuid
      AND i.status='paid' AND i.confirmed_at IS NOT NULL
      AND t.status='confirmed' AND t.confirmed_at IS NOT NULL
      AND t.confirmations>0
      AND t.network=i.network AND t.amount=i.expected_amount
      AND lower(t.to_address)=lower(i.receiving_address)
      AND lower(t.token_identifier)=lower(i.token_identifier)
  ) INTO paid;
  IF paid THEN RAISE EXCEPTION 'Wrong token accepted'; END IF;

  UPDATE public.crypto_payment_transactions
    SET token_identifier='0xphase10token',confirmations=0
  WHERE id=chain_event_id;
  SELECT EXISTS(
    SELECT 1 FROM public.crypto_payment_transactions t
    JOIN public.crypto_payment_invoices i
      ON t.owner_principal=i.owner_principal AND t.invoice_id=i.id
    WHERE t.owner_principal=owner AND t.invoice_id=fixture_invoice_uuid
      AND i.status='paid' AND i.confirmed_at IS NOT NULL
      AND t.status='confirmed' AND t.confirmed_at IS NOT NULL
      AND t.confirmations>0
      AND t.network=i.network AND t.amount=i.expected_amount
      AND lower(t.to_address)=lower(i.receiving_address)
      AND lower(t.token_identifier)=lower(i.token_identifier)
  ) INTO paid;
  IF paid THEN RAISE EXCEPTION 'Unconfirmed transfer accepted'; END IF;

  UPDATE public.crypto_payment_transactions SET confirmations=15
  WHERE id=chain_event_id;
  SELECT EXISTS(
    SELECT 1 FROM public.crypto_payment_transactions t
    JOIN public.crypto_payment_invoices i
      ON t.owner_principal=i.owner_principal AND t.invoice_id=i.id
    WHERE t.owner_principal=owner AND t.invoice_id=fixture_invoice_uuid
      AND i.status='paid' AND i.confirmed_at IS NOT NULL
      AND t.status='confirmed' AND t.confirmed_at IS NOT NULL
      AND t.confirmations>0
      AND t.network=i.network AND t.amount=i.expected_amount
      AND lower(t.to_address)=lower(i.receiving_address)
      AND lower(t.token_identifier)=lower(i.token_identifier)
  ) INTO paid;
  IF NOT paid THEN RAISE EXCEPTION 'Correct confirmed transfer not verified'; END IF;

  BEGIN
    INSERT INTO public.crypto_payment_transactions
      (owner_principal,invoice_id,network,tx_hash,event_index,
       token_identifier,to_address,amount,confirmations,status,confirmed_at)
    VALUES (owner,fixture_invoice_uuid,'bsc',transfer_hash,'0',
      '0xphase10token','0xphase10receiver',16.500001,15,'confirmed',now());
    RAISE EXCEPTION 'Duplicate chain event accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.crypto_payment_transactions
      (owner_principal,invoice_id,network,tx_hash,event_index,
       token_identifier,to_address,amount,confirmations,status,confirmed_at)
    VALUES (other_owner,fixture_invoice_uuid,'bsc',transfer_hash,'1',
      '0xphase10token','0xphase10receiver',16.500001,15,'confirmed',now());
    RAISE EXCEPTION 'Cross-owner invoice event accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  IF EXISTS(
    SELECT 1 FROM public.billing_subscriptions
    WHERE owner_principal IN (owner,other_owner)
  ) THEN RAISE EXCEPTION 'Synthetic payment evidence accidentally activated an account'; END IF;
END
$phase10$;
ROLLBACK;
