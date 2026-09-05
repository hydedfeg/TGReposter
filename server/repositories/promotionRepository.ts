import { Pool } from "pg";
import { getPostgresConnectionString } from "../utils/postgresConnection";

export type TelegramBotCredentialSource = "legacy_settings" | "environment" | "vault";
export type PromotionTargetChatType = "channel" | "group" | "supergroup";
export type PromotionTargetConnectionStatus = "unknown" | "ok" | "error";

export interface TelegramBotAccountRecord {
  id: string;
  name: string;
  botUsername?: string;
  credentialSource: TelegramBotCredentialSource;
  credentialRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionTargetRecord {
  id: string;
  botAccountId: string;
  name: string;
  chatId: string;
  chatType?: PromotionTargetChatType;
  enabled: boolean;
  connectionStatus: PromotionTargetConnectionStatus;
  lastCheckedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBotAccountInput {
  name: string;
  botUsername?: string;
  credentialSource: TelegramBotCredentialSource;
  credentialRef: string;
  enabled?: boolean;
}

export interface UpdateBotAccountInput {
  name?: string;
  botUsername?: string | null;
  credentialSource?: TelegramBotCredentialSource;
  credentialRef?: string;
  enabled?: boolean;
}

export interface CreatePromotionTargetInput {
  botAccountId: string;
  name: string;
  chatId: string;
  chatType?: PromotionTargetChatType;
  enabled?: boolean;
}

export interface UpdatePromotionTargetInput {
  botAccountId?: string;
  name?: string;
  chatId?: string;
  chatType?: PromotionTargetChatType | null;
  enabled?: boolean;
  connectionStatus?: PromotionTargetConnectionStatus;
  lastCheckedAt?: string | null;
  errorMessage?: string | null;
}

let pool: Pool | null = null;

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Promotion owner principal is required.");
  }
  return ownerPrincipal;
}

function getPool(): Pool {
  const connectionString = getPostgresConnectionString();

  if (!pool) {
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

function mapBotAccount(row: any): TelegramBotAccountRecord {
  return {
    id: row.id,
    name: row.name,
    botUsername: row.bot_username ?? undefined,
    credentialSource: row.credential_source,
    credentialRef: row.credential_ref,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTarget(row: any): PromotionTargetRecord {
  return {
    id: row.id,
    botAccountId: row.bot_account_id,
    name: row.name,
    chatId: row.chat_id,
    chatType: row.chat_type ?? undefined,
    enabled: row.enabled,
    connectionStatus: row.connection_status,
    lastCheckedAt: row.last_checked_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PromotionRepository {
  async listBotAccounts(ownerPrincipal: string): Promise<TelegramBotAccountRecord[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `select id, name, bot_username, credential_source, credential_ref, enabled, created_at, updated_at
       from public.telegram_bot_accounts
       where owner_principal = $1
       order by created_at asc`,
      [owner]
    );
    return result.rows.map(mapBotAccount);
  }

  async getBotAccount(ownerPrincipal: string, id: string): Promise<TelegramBotAccountRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `select id, name, bot_username, credential_source, credential_ref, enabled, created_at, updated_at
       from public.telegram_bot_accounts
       where owner_principal = $1 and id = $2
       limit 1`,
      [owner, id]
    );
    return result.rows[0] ? mapBotAccount(result.rows[0]) : null;
  }

  async createBotAccount(ownerPrincipal: string, input: CreateBotAccountInput): Promise<TelegramBotAccountRecord> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `insert into public.telegram_bot_accounts
        (owner_principal, name, bot_username, credential_source, credential_ref, enabled)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, bot_username, credential_source, credential_ref, enabled, created_at, updated_at`,
      [owner, input.name, input.botUsername ?? null, input.credentialSource, input.credentialRef, input.enabled ?? true]
    );
    return mapBotAccount(result.rows[0]);
  }

  async updateBotAccount(
    ownerPrincipal: string,
    id: string,
    input: UpdateBotAccountInput
  ): Promise<TelegramBotAccountRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const current = await this.getBotAccount(owner, id);
    if (!current) return null;

    const result = await getPool().query(
      `update public.telegram_bot_accounts
       set name = $3,
           bot_username = $4,
           credential_source = $5,
           credential_ref = $6,
           enabled = $7,
           updated_at = now()
       where owner_principal = $1 and id = $2
       returning id, name, bot_username, credential_source, credential_ref, enabled, created_at, updated_at`,
      [
        owner,
        id,
        input.name ?? current.name,
        input.botUsername === undefined ? current.botUsername ?? null : input.botUsername,
        input.credentialSource ?? current.credentialSource,
        input.credentialRef ?? current.credentialRef,
        input.enabled ?? current.enabled,
      ]
    );
    return result.rows[0] ? mapBotAccount(result.rows[0]) : null;
  }

  async deleteBotAccount(ownerPrincipal: string, id: string): Promise<boolean> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `delete from public.telegram_bot_accounts where owner_principal = $1 and id = $2`,
      [owner, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTargets(ownerPrincipal: string): Promise<PromotionTargetRecord[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `select id, bot_account_id, name, chat_id, chat_type, enabled,
              connection_status, last_checked_at, error_message, created_at, updated_at
       from public.promotion_targets
       where owner_principal = $1
       order by created_at asc`,
      [owner]
    );
    return result.rows.map(mapTarget);
  }

  async getTarget(ownerPrincipal: string, id: string): Promise<PromotionTargetRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `select id, bot_account_id, name, chat_id, chat_type, enabled,
              connection_status, last_checked_at, error_message, created_at, updated_at
       from public.promotion_targets
       where owner_principal = $1 and id = $2
       limit 1`,
      [owner, id]
    );
    return result.rows[0] ? mapTarget(result.rows[0]) : null;
  }

  async createTarget(ownerPrincipal: string, input: CreatePromotionTargetInput): Promise<PromotionTargetRecord> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `insert into public.promotion_targets
        (owner_principal, bot_account_id, name, chat_id, chat_type, enabled)
       values ($1, $2, $3, $4, $5, $6)
       returning id, bot_account_id, name, chat_id, chat_type, enabled,
                 connection_status, last_checked_at, error_message, created_at, updated_at`,
      [owner, input.botAccountId, input.name, input.chatId, input.chatType ?? null, input.enabled ?? true]
    );
    return mapTarget(result.rows[0]);
  }

  async updateTarget(
    ownerPrincipal: string,
    id: string,
    input: UpdatePromotionTargetInput
  ): Promise<PromotionTargetRecord | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const current = await this.getTarget(owner, id);
    if (!current) return null;

    const result = await getPool().query(
      `update public.promotion_targets
       set bot_account_id = $3,
           name = $4,
           chat_id = $5,
           chat_type = $6,
           enabled = $7,
           connection_status = $8,
           last_checked_at = $9,
           error_message = $10,
           updated_at = now()
       where owner_principal = $1 and id = $2
       returning id, bot_account_id, name, chat_id, chat_type, enabled,
                 connection_status, last_checked_at, error_message, created_at, updated_at`,
      [
        owner,
        id,
        input.botAccountId ?? current.botAccountId,
        input.name ?? current.name,
        input.chatId ?? current.chatId,
        input.chatType === undefined ? current.chatType ?? null : input.chatType,
        input.enabled ?? current.enabled,
        input.connectionStatus ?? current.connectionStatus,
        input.lastCheckedAt === undefined ? current.lastCheckedAt ?? null : input.lastCheckedAt,
        input.errorMessage === undefined ? current.errorMessage ?? null : input.errorMessage,
      ]
    );
    return result.rows[0] ? mapTarget(result.rows[0]) : null;
  }

  async deleteTarget(ownerPrincipal: string, id: string): Promise<boolean> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const result = await getPool().query(
      `delete from public.promotion_targets where owner_principal = $1 and id = $2`,
      [owner, id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export default new PromotionRepository();
