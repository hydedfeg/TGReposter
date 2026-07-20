import { getSupabaseClient } from "../../supabase";

export interface PostEntity {
  id: string;
  channel_username: string;
  original_text: string;
  edited_text: string;
  photo_url?: string;
  telegram_url: string;
  published_at: string;
  status: string;
}

export class PostRepository {
  private client = getSupabaseClient();

  async upsertMany(posts: PostEntity[]) {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from("posts")
      .upsert(posts, {
        onConflict: "id",
      })
      .select();

    if (error) throw error;

    return data ?? [];
  }

  async getRecent(limit = 400) {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from("posts")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data ?? [];
  }

  async count() {
    if (!this.client) return 0;

    const { count, error } = await this.client
      .from("posts")
      .select("*", {
        head: true,
        count: "exact",
      });

    if (error) throw error;

    return count ?? 0;
  }
}

export default new PostRepository();