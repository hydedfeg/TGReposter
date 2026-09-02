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
  mediaType?: 'photo' | 'video';
  photoUrl?: string;
  videoUrl?: string;
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
  // Kept as an empty compatibility field while the primary credential lives in Vault.
  botToken: string;
  botTokenConfigured?: boolean;
  channelId?: string; // Kept for backwards compatibility
  targets: DestinationTarget[];
  connected: boolean;
}

export type TelegramBotCredentialSource = 'legacy_settings' | 'environment' | 'vault';

export interface TelegramBotAccount {
  id: string;
  name: string;
  botUsername?: string;
  credentialSource: TelegramBotCredentialSource;
  credentialRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PromotionTargetChatType = 'channel' | 'group' | 'supergroup';
export type PromotionTargetConnectionStatus = 'unknown' | 'ok' | 'error';

export interface PromotionTarget {
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

export type PromotionCampaignStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface PromotionCampaign {
  id: string;
  name: string;
  description?: string;
  status: PromotionCampaignStatus;
  createdByUsername?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PromotionContentMode = 'original' | 'teaser' | 'ai' | 'custom';

export interface PromotionCampaignPost {
  id: string;
  campaignId: string;
  postId: string;
  contentMode: PromotionContentMode;
  promotionText?: string;
  ctaText?: string;
  sourceLinkOverride?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type PromotionDeliveryStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

export interface PromotionDelivery {
  id: string;
  campaignPostId: string;
  targetId: string;
  status: PromotionDeliveryStatus;
  attemptCount: number;
  telegramMessageId?: number;
  warningMessage?: string;
  errorMessage?: string;
  lastAttemptAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PromotionDeliveryOutcome = 'success' | 'failed' | 'warning';

export interface PromotionDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  outcome: PromotionDeliveryOutcome;
  telegramMessageId?: number;
  telegramErrorCode?: number;
  warningMessage?: string;
  errorMessage?: string;
  attemptedAt: string;
}

export interface AIConfig {
  provider: "gemini" | "openrouter";
  model: string;
}

export interface CuratorUser {
  id?: string;
  username: string;
  email?: string;
  role: 'super-admin' | 'admin';
  isActive?: boolean;
  authProvider?: 'supabase' | 'legacy';
  createdAt: string;
}

export interface CuratorSettings {
  channels: SourceChannel[];
  filters: FilterConfig;
  destination: DestinationConfig;
  aiConfig?: AIConfig;
  posts: CuratedPost[];
  passwordSet?: boolean;
  supabaseActive?: boolean;
  users?: CuratorUser[];
}