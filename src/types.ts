export interface SourceChannel {
  username: string;
  name?: string;
  lastFetched?: string;
  status?: 'idle' | 'fetching' | 'success' | 'error';
  errorMessage?: string;
}

export interface FilterConfig {
  positiveKeywords: string[];
  negativeKeywords: string[];
  requiredHashtags: string[];
  caseSensitive: boolean;
}

export interface CuratedPost {
  id: string; // unique identifier, e.g. "channel_username/msg_id"
  channelUsername: string;
  originalText: string;
  text: string; // the curated/edited text
  photoUrl?: string;
  date: string;
  url: string;
  status: 'pending' | 'approved' | 'posted' | 'archived';
  postedAt?: string;
  errorMessage?: string;
}

export interface DestinationTarget {
  id: string;
  channelId: string; // e.g. "@my_channel" or "-100123456789"
  name: string;      // Friendly display name
  enabled: boolean;
  status?: 'idle' | 'success' | 'error';
  errorMessage?: string;
}

export interface DestinationConfig {
  botToken: string;
  channelId?: string; // Kept for backwards compatibility
  targets: DestinationTarget[];
  connected: boolean;
}

export interface CuratorSettings {
  channels: SourceChannel[];
  filters: FilterConfig;
  destination: DestinationConfig;
  posts: CuratedPost[];
  passwordSet?: boolean;
  supabaseActive?: boolean;
}
