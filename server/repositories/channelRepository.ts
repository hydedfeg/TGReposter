import { getPostgresPool } from "../utils/postgresPool";

export interface SourceChannel {
  id?: string;
  username: string;
  display_name?: string;
  enabled?: boolean;
  last_scan_at?: string | null;
  status?: "idle" | "fetching" | "success" | "error";
  error_message?: string | null;
}

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Source channel owner principal is required.");
  }
  return ownerPrincipal;
}

export class ChannelRepository {
  async getAll(ownerPrincipal: string): Promise<SourceChannel[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const { rows } = await getPostgresPool().query(
      `
        select id, username, display_name, enabled, last_scan_at, status, error_message
        from public.source_channels
        where owner_principal = $1
        order by created_at asc, username asc
      `,
      [owner]
    );

    return rows;
  }

  async create(ownerPrincipal: string, channel: SourceChannel) {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    await getPostgresPool().query(
      `
        insert into public.source_channels
          (owner_principal, username, display_name, enabled, status, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (owner_principal, username) do update
        set display_name = excluded.display_name,
            enabled = excluded.enabled,
            status = excluded.status,
            updated_at = now()
      `,
      [
        owner,
        channel.username,
        channel.display_name ?? null,
        channel.enabled ?? true,
        channel.status ?? "idle",
      ]
    );
  }

  async saveScanState(ownerPrincipal: string, channel: SourceChannel) {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    await getPostgresPool().query(
      `
        insert into public.source_channels
          (owner_principal, username, display_name, enabled, last_scan_at, status, error_message, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (owner_principal, username) do update
        set display_name = coalesce(excluded.display_name, public.source_channels.display_name),
            last_scan_at = coalesce(excluded.last_scan_at, public.source_channels.last_scan_at),
            status = excluded.status,
            error_message = excluded.error_message,
            updated_at = now()
      `,
      [
        owner,
        channel.username,
        channel.display_name ?? null,
        channel.enabled ?? true,
        channel.last_scan_at ?? null,
        channel.status ?? "idle",
        channel.error_message ?? null,
      ]
    );
  }

  async remove(ownerPrincipal: string, username: string) {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    await getPostgresPool().query(
      `delete from public.source_channels where owner_principal = $1 and username = $2`,
      [owner, username]
    );
  }

  async listOwnersWithEnabledChannels(): Promise<string[]> {
    const { rows } = await getPostgresPool().query(
      `
        select distinct owner_principal
        from public.source_channels
        where owner_principal is not null
          and enabled is not false
        order by owner_principal
      `
    );

    return rows.map(row => cleanOwnerPrincipal(String(row.owner_principal)));
  }
}
