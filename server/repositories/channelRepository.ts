import { getSupabaseClient } from "../../supabase";

export interface SourceChannel {
  id?: string;
  username: string;
  display_name?: string;
  enabled?: boolean;
}

export class ChannelRepository {
  private client = getSupabaseClient();

  async getAll(): Promise<SourceChannel[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from("source_channels")
      .select("*")
      .order("username");

    if (error) throw error;

    return data ?? [];
  }

  async create(channel: SourceChannel) {
    if (!this.client) return;

    const { error } = await this.client
      .from("source_channels")
      .insert(channel);

    if (error) throw error;
  }

  async remove(username: string) {
    if (!this.client) return;

    const { error } = await this.client
      .from("source_channels")
      .delete()
      .eq("username", username);

    if (error) throw error;
  }
}