import crypto from "crypto";
import { getPostgresPool } from "../utils/postgresPool";

const VALID_TARGET_STATUSES = new Set(["idle", "success", "error"]);

export interface UserDestinationTarget {
  id: string;
  channelId: string;
  name: string;
  enabled: boolean;
  status?: "idle" | "success" | "error";
  errorMessage?: string;
}

export interface DestinationStatusUpdate {
  targetId: string;
  success: boolean;
  error?: string;
}

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Destination owner principal is required.");
  }
  return ownerPrincipal;
}

function sanitizeStatus(value: unknown): "idle" | "success" | "error" {
  return typeof value === "string" && VALID_TARGET_STATUSES.has(value)
    ? value as "idle" | "success" | "error"
    : "idle";
}

function normalizeTarget(target: any): UserDestinationTarget {
  const channelId =
    typeof target?.channelId === "string" ? target.channelId.trim() : "";

  if (!channelId) {
    throw new Error("Every destination requires a Telegram channel ID or username.");
  }

  const targetId =
    typeof target?.id === "string" && target.id.trim()
      ? target.id.trim()
      : `target-${crypto.randomUUID()}`;

  const name =
    typeof target?.name === "string" && target.name.trim()
      ? target.name.trim()
      : channelId;

  return {
    id: targetId,
    channelId,
    name,
    enabled: target?.enabled !== false,
    status: sanitizeStatus(target?.status),
    errorMessage:
      typeof target?.errorMessage === "string" && target.errorMessage.trim()
        ? target.errorMessage.trim()
        : undefined,
  };
}

function mapTarget(row: any): UserDestinationTarget {
  return {
    id: row.client_id ?? row.id,
    channelId: row.channel_id,
    name: row.name,
    enabled: row.enabled !== false,
    status: sanitizeStatus(row.status),
    errorMessage: row.error_message ?? undefined,
  };
}

export class UserDestinationRepository {
  async listTargets(ownerPrincipal: string): Promise<UserDestinationTarget[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPostgresPool().query(
      `
        select id, client_id, name, channel_id, enabled, status, error_message
        from public.destination_targets
        where owner_principal = $1
        order by created_at asc, id asc
      `,
      [owner]
    );

    return result.rows.map(mapTarget);
  }

  async replaceTargets(
    ownerPrincipal: string,
    rawTargets: unknown
  ): Promise<UserDestinationTarget[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const targets = Array.isArray(rawTargets)
      ? rawTargets.map(normalizeTarget)
      : [];

    const seenIds = new Set<string>();
    for (const target of targets) {
      if (seenIds.has(target.id)) {
        throw new Error(`Duplicate destination ID '${target.id}'.`);
      }
      seenIds.add(target.id);
    }

    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("begin");

      if (targets.length === 0) {
        await client.query(
          `delete from public.destination_targets where owner_principal = $1`,
          [owner]
        );
      } else {
        await client.query(
          `
            delete from public.destination_targets
            where owner_principal = $1
              and not (client_id = any($2::text[]))
          `,
          [owner, targets.map(target => target.id)]
        );
      }

      for (const target of targets) {
        await client.query(
          `
            insert into public.destination_targets
              (owner_principal, client_id, name, channel_id, enabled, status, error_message, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7, now(), now())
            on conflict (owner_principal, client_id)
              where owner_principal is not null and client_id is not null
            do update
            set name = excluded.name,
                channel_id = excluded.channel_id,
                enabled = excluded.enabled,
                status = excluded.status,
                error_message = excluded.error_message,
                updated_at = now()
          `,
          [
            owner,
            target.id,
            target.name,
            target.channelId,
            target.enabled,
            target.status ?? "idle",
            target.errorMessage ?? null,
          ]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return this.listTargets(owner);
  }

  async updateStatuses(
    ownerPrincipal: string,
    updates: DestinationStatusUpdate[]
  ): Promise<void> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();

    await Promise.all(
      updates.map(update =>
        pool.query(
          `
            update public.destination_targets
            set status = $3,
                error_message = $4,
                updated_at = now()
            where owner_principal = $1
              and client_id = $2
          `,
          [
            owner,
            update.targetId,
            update.success ? "success" : "error",
            update.success ? null : update.error ?? "Telegram publishing failed.",
          ]
        )
      )
    );
  }
}

export default new UserDestinationRepository();
