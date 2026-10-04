import { getPostgresPool } from "../utils/postgresPool";
import { assertCryptoInvoiceTransition } from "../payments/paymentState";
import type {
  CryptoPaymentInvoiceStatus,
  CryptoPaymentNetwork,
  CryptoPaymentTransactionStatus,
  CryptoPaymentTransferObservation,
} from "../payments/types";

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Crypto payment owner principal is required.");
  }
  return ownerPrincipal;
}

export interface CreateCryptoPaymentInvoiceInput {
  network: CryptoPaymentNetwork;
  expectedAmount: string;
  receivingAddress: string;
  tokenIdentifier: string;
  expiresAt: string;
}

export interface CryptoPaymentInvoiceRecord {
  id: string;
  owner_principal: string;
  asset_code: "USDT";
  network: CryptoPaymentNetwork;
  expected_amount: string;
  receiving_address: string;
  token_identifier: string;
  status: CryptoPaymentInvoiceStatus;
  expires_at: string;
  detected_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export class CryptoPaymentRepository {
  async createInvoice(
    ownerPrincipal: string,
    input: CreateCryptoPaymentInvoiceInput
  ): Promise<CryptoPaymentInvoiceRecord> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const { rows } = await getPostgresPool().query(
      `
        insert into public.crypto_payment_invoices
          (
            owner_principal,
            asset_code,
            network,
            expected_amount,
            receiving_address,
            token_identifier,
            status,
            expires_at,
            updated_at
          )
        values ($1, 'USDT', $2, $3::numeric, $4, $5, 'pending', $6::timestamptz, now())
        returning *
      `,
      [
        owner,
        input.network,
        input.expectedAmount,
        input.receivingAddress,
        input.tokenIdentifier,
        input.expiresAt,
      ]
    );

    return rows[0];
  }

  async getInvoice(
    ownerPrincipal: string,
    invoiceId: string
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const { rows } = await getPostgresPool().query(
      `
        select *
        from public.crypto_payment_invoices
        where owner_principal = $1
          and id = $2::uuid
        limit 1
      `,
      [owner, invoiceId]
    );

    return rows[0] ?? null;
  }

  async listOpenInvoicesForNetwork(
    network: CryptoPaymentNetwork
  ): Promise<CryptoPaymentInvoiceRecord[]> {
    const { rows } = await getPostgresPool().query(
      `
        select *
        from public.crypto_payment_invoices
        where network = $1
          and status = any(array['pending', 'detected', 'confirming']::text[])
          and expires_at > now()
        order by created_at asc
      `,
      [network]
    );

    return rows;
  }

  async updateInvoiceStatus(
    ownerPrincipal: string,
    invoiceId: string,
    status: CryptoPaymentInvoiceStatus
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const client = await getPostgresPool().connect();

    try {
      await client.query("begin");

      const currentResult = await client.query(
        `
          select *
          from public.crypto_payment_invoices
          where owner_principal = $1
            and id = $2::uuid
          for update
        `,
        [owner, invoiceId]
      );

      const current = currentResult.rows[0] as
        | CryptoPaymentInvoiceRecord
        | undefined;

      if (!current) {
        await client.query("rollback");
        return null;
      }

      assertCryptoInvoiceTransition(current.status, status);

      const detectedAt =
        status === "detected" || status === "confirming" || status === "paid";
      const confirmedAt = status === "paid";
      const cancelledAt = status === "cancelled";

      const { rows } = await client.query(
        `
          update public.crypto_payment_invoices
          set status = $3,
              detected_at = case
                when $4::boolean then coalesce(detected_at, now())
                else detected_at
              end,
              confirmed_at = case
                when $5::boolean then coalesce(confirmed_at, now())
                else confirmed_at
              end,
              cancelled_at = case
                when $6::boolean then coalesce(cancelled_at, now())
                else cancelled_at
              end,
              updated_at = now()
          where owner_principal = $1
            and id = $2::uuid
          returning *
        `,
        [owner, invoiceId, status, detectedAt, confirmedAt, cancelledAt]
      );

      await client.query("commit");
      return rows[0] ?? null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertObservedTransfer(
    ownerPrincipal: string,
    invoiceId: string,
    observation: CryptoPaymentTransferObservation,
    status: CryptoPaymentTransactionStatus
  ): Promise<string> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const { rows } = await getPostgresPool().query(
      `
        insert into public.crypto_payment_transactions
          (
            owner_principal,
            invoice_id,
            network,
            tx_hash,
            event_index,
            token_identifier,
            from_address,
            to_address,
            amount,
            block_reference,
            confirmations,
            status,
            first_seen_at,
            confirmed_at,
            updated_at
          )
        values
          (
            $1,
            $2::uuid,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::numeric,
            $10,
            $11,
            $12,
            $13::timestamptz,
            case when $12 = 'confirmed' then now() else null end,
            now()
          )
        on conflict (network, tx_hash, event_index) do update
        set confirmations = greatest(
              public.crypto_payment_transactions.confirmations,
              excluded.confirmations
            ),
            block_reference = coalesce(
              excluded.block_reference,
              public.crypto_payment_transactions.block_reference
            ),
            status = case
              when public.crypto_payment_transactions.status = 'confirmed'
                then 'confirmed'
              else excluded.status
            end,
            confirmed_at = case
              when excluded.status = 'confirmed'
                then coalesce(
                  public.crypto_payment_transactions.confirmed_at,
                  now()
                )
              else public.crypto_payment_transactions.confirmed_at
            end,
            updated_at = now()
        where public.crypto_payment_transactions.owner_principal = excluded.owner_principal
          and public.crypto_payment_transactions.invoice_id = excluded.invoice_id
        returning id
      `,
      [
        owner,
        invoiceId,
        observation.network,
        observation.txHash,
        observation.eventIndex,
        observation.tokenIdentifier,
        observation.fromAddress ?? null,
        observation.toAddress,
        observation.amount,
        observation.blockReference ?? null,
        observation.confirmations,
        status,
        observation.observedAt,
      ]
    );

    if (!rows[0]?.id) {
      throw new Error(
        "Observed transfer already belongs to a different payment invoice."
      );
    }

    return String(rows[0].id);
  }

  async getNetworkCursor(input: {
    network: CryptoPaymentNetwork;
    tokenIdentifier: string;
    receivingAddress: string;
  }): Promise<string | null> {
    const { rows } = await getPostgresPool().query(
      `
        select cursor
        from public.crypto_payment_network_state
        where network = $1
          and token_identifier = $2
          and receiving_address = $3
        limit 1
      `,
      [input.network, input.tokenIdentifier, input.receivingAddress]
    );

    return rows[0]?.cursor ? String(rows[0].cursor) : null;
  }

  async saveNetworkCursor(input: {
    network: CryptoPaymentNetwork;
    tokenIdentifier: string;
    receivingAddress: string;
    cursor: string;
  }): Promise<void> {
    await getPostgresPool().query(
      `
        insert into public.crypto_payment_network_state
          (
            network,
            token_identifier,
            receiving_address,
            cursor,
            last_scanned_at,
            updated_at
          )
        values ($1, $2, $3, $4, now(), now())
        on conflict (network, token_identifier, receiving_address) do update
        set cursor = excluded.cursor,
            last_scanned_at = now(),
            updated_at = now()
      `,
      [
        input.network,
        input.tokenIdentifier,
        input.receivingAddress,
        input.cursor,
      ]
    );
  }

  async appendEvent(input: {
    ownerPrincipal: string;
    invoiceId: string;
    transactionId?: string;
    source: "system" | CryptoPaymentNetwork;
    sourceEventId: string;
    eventType: string;
    occurredAt?: string;
  }): Promise<boolean> {
    const owner = cleanOwnerPrincipal(input.ownerPrincipal);
    const { rowCount } = await getPostgresPool().query(
      `
        insert into public.crypto_payment_events
          (
            owner_principal,
            invoice_id,
            transaction_id,
            source,
            source_event_id,
            event_type,
            occurred_at,
            processed_at
          )
        values (
          $1,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6,
          coalesce($7::timestamptz, now()),
          now()
        )
        on conflict (source, source_event_id) do nothing
      `,
      [
        owner,
        input.invoiceId,
        input.transactionId ?? null,
        input.source,
        input.sourceEventId,
        input.eventType,
        input.occurredAt ?? null,
      ]
    );

    return (rowCount ?? 0) > 0;
  }
}
