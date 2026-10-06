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
  requestedAmount: string;
  expectedAmount: string;
  requestKey?: string;
  receivingAddress: string;
  tokenIdentifier: string;
  expiresAt: string;
}

export interface CryptoPaymentInvoiceRecord {
  id: string;
  owner_principal: string;
  asset_code: "USDT";
  network: CryptoPaymentNetwork;
  requested_amount: string;
  expected_amount: string;
  request_key: string | null;
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
            requested_amount,
            expected_amount,
            request_key,
            receiving_address,
            token_identifier,
            status,
            expires_at,
            updated_at
          )
        values (
          $1,
          'USDT',
          $2,
          $3::numeric,
          $4::numeric,
          $5,
          $6,
          $7,
          'pending',
          $8::timestamptz,
          now()
        )
        returning *
      `,
      [
        owner,
        input.network,
        input.requestedAmount,
        input.expectedAmount,
        input.requestKey?.trim() || null,
        input.receivingAddress,
        input.tokenIdentifier,
        input.expiresAt,
      ]
    );

    return rows[0];
  }

  async tryCreateReservedInvoice(
    ownerPrincipal: string,
    input: CreateCryptoPaymentInvoiceInput & {
      reservedUntil: string;
    }
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const client = await getPostgresPool().connect();

    try {
      await client.query("begin");

      await client.query(
        `
          delete from public.crypto_payment_amount_reservations
          where network = $1
            and receiving_address = $2
            and token_identifier = $3
            and expected_amount = $4::numeric
            and reserved_until <= now()
        `,
        [
          input.network,
          input.receivingAddress,
          input.tokenIdentifier,
          input.expectedAmount,
        ]
      );

      const invoiceResult = await client.query(
        `
          insert into public.crypto_payment_invoices
            (
              owner_principal,
              asset_code,
              network,
              requested_amount,
              expected_amount,
              request_key,
              receiving_address,
              token_identifier,
              status,
              expires_at,
              updated_at
            )
          values (
            $1,
            'USDT',
            $2,
            $3::numeric,
            $4::numeric,
            $5,
            $6,
            $7,
            'pending',
            $8::timestamptz,
            now()
          )
          returning *
        `,
        [
          owner,
          input.network,
          input.requestedAmount,
          input.expectedAmount,
          input.requestKey?.trim() || null,
          input.receivingAddress,
          input.tokenIdentifier,
          input.expiresAt,
        ]
      );

      const invoice = invoiceResult.rows[0] as CryptoPaymentInvoiceRecord;

      const reservationResult = await client.query(
        `
          insert into public.crypto_payment_amount_reservations
            (
              network,
              receiving_address,
              token_identifier,
              expected_amount,
              owner_principal,
              invoice_id,
              reserved_until,
              updated_at
            )
          values (
            $1,
            $2,
            $3,
            $4::numeric,
            $5,
            $6::uuid,
            $7::timestamptz,
            now()
          )
          on conflict (
            network,
            receiving_address,
            token_identifier,
            expected_amount
          ) do nothing
          returning invoice_id
        `,
        [
          input.network,
          input.receivingAddress,
          input.tokenIdentifier,
          input.expectedAmount,
          owner,
          invoice.id,
          input.reservedUntil,
        ]
      );

      if (!reservationResult.rows[0]?.invoice_id) {
        await client.query("rollback");
        return null;
      }

      await client.query(
        `
          insert into public.crypto_payment_events
            (
              owner_principal,
              invoice_id,
              source,
              source_event_id,
              event_type,
              occurred_at,
              processed_at
            )
          values (
            $1,
            $2::uuid,
            'system',
            $3,
            'invoice_created',
            now(),
            now()
          )
          on conflict (source, source_event_id) do nothing
        `,
        [owner, invoice.id, `invoice:${invoice.id}:created`]
      );

      await client.query("commit");
      return invoice;
    } catch (error: any) {
      await client.query("rollback");

      if (
        input.requestKey &&
        error?.code === "23505" &&
        error?.constraint ===
          "crypto_payment_invoices_owner_request_key_idx"
      ) {
        return this.getInvoiceByRequestKey(
          owner,
          input.requestKey
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async getInvoiceByRequestKey(
    ownerPrincipal: string,
    requestKey: string
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const cleanedRequestKey = requestKey.trim();

    if (!cleanedRequestKey) {
      throw new Error("Crypto payment request key is required.");
    }

    const { rows } = await getPostgresPool().query(
      `
        select *
        from public.crypto_payment_invoices
        where owner_principal = $1
          and request_key = $2
        limit 1
      `,
      [owner, cleanedRequestKey]
    );

    return rows[0] ?? null;
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

  async findInvoicesMatchingObservation(
    observation: CryptoPaymentTransferObservation
  ): Promise<CryptoPaymentInvoiceRecord[]> {
    const { rows } = await getPostgresPool().query(
      `
        select *
        from public.crypto_payment_invoices
        where network = $1
          and status = any(array['pending', 'detected', 'confirming']::text[])
          and expected_amount = $2::numeric
          and created_at <= $3::timestamptz
          and expires_at >= $3::timestamptz
          and (
            (
              network = any(array['bsc', 'ethereum']::text[])
              and lower(receiving_address) = lower($4)
              and lower(token_identifier) = lower($5)
            )
            or
            (
              network = 'ton'
              and receiving_address = $4
              and token_identifier = $5
            )
          )
        order by created_at asc
        limit 2
      `,
      [
        observation.network,
        observation.amount,
        observation.observedAt,
        observation.toAddress,
        observation.tokenIdentifier,
      ]
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

  async getTransactionAssignment(input: {
    network: CryptoPaymentNetwork;
    txHash: string;
    eventIndex: string;
  }): Promise<{ ownerPrincipal: string; invoiceId: string } | null> {
    const { rows } = await getPostgresPool().query(
      `
        select owner_principal, invoice_id
        from public.crypto_payment_transactions
        where network = $1
          and tx_hash = $2
          and event_index = $3
        limit 1
      `,
      [input.network, input.txHash, input.eventIndex]
    );

    if (!rows[0]) {
      return null;
    }

    return {
      ownerPrincipal: String(rows[0].owner_principal),
      invoiceId: String(rows[0].invoice_id),
    };
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

  async expireStaleInvoicesAndReleaseReservations(): Promise<{
    expiredInvoices: number;
    releasedReservations: number;
  }> {
    const client = await getPostgresPool().connect();

    try {
      await client.query("begin");

      const expiredResult = await client.query(
        `
          with expired as (
            update public.crypto_payment_invoices as invoice
            set status = 'expired',
                updated_at = now()
            from public.crypto_payment_amount_reservations as reservation
            where reservation.owner_principal = invoice.owner_principal
              and reservation.invoice_id = invoice.id
              and reservation.reserved_until <= now()
              and invoice.status = 'pending'
            returning invoice.owner_principal, invoice.id
          )
          insert into public.crypto_payment_events
            (
              owner_principal,
              invoice_id,
              source,
              source_event_id,
              event_type,
              occurred_at,
              processed_at
            )
          select
            owner_principal,
            id,
            'system',
            'invoice:' || id::text || ':expired',
            'invoice_expired',
            now(),
            now()
          from expired
          on conflict (source, source_event_id) do nothing
          returning invoice_id
        `
      );

      const releasedResult = await client.query(
        `
          delete from public.crypto_payment_amount_reservations
          where reserved_until <= now()
            and exists (
              select 1
              from public.crypto_payment_invoices as invoice
              where invoice.owner_principal =
                      crypto_payment_amount_reservations.owner_principal
                and invoice.id =
                      crypto_payment_amount_reservations.invoice_id
                and invoice.status = any(
                  array[
                    'paid',
                    'expired',
                    'underpaid',
                    'overpaid',
                    'failed',
                    'cancelled'
                  ]::text[]
                )
            )
          returning invoice_id
        `
      );

      await client.query("commit");

      return {
        expiredInvoices: expiredResult.rowCount ?? 0,
        releasedReservations: releasedResult.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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
