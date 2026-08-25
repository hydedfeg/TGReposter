# TGReposter Promotion Campaign Architecture

## Goal

Add a promotion workflow that can take selected posts from a configured Telegram source channel and distribute promotional versions of those posts to authorized Telegram channels and groups.

This is separate from the existing curation/reposting workflow. Promotion campaigns have their own targets, delivery state, retry history, and reporting.

## Core Principles

1. Reuse the existing Telegram publishing engine rather than duplicate sendPhoto/sendVideo/sendMessage logic.
2. Only publish to Telegram chats where the configured bot has permission to post.
3. Keep raw Telegram bot tokens backend-only. Database rows store credential references, never raw tokens.
4. Track delivery independently per campaign post and destination so one failure does not block other targets.
5. Prevent duplicate campaign delivery with database uniqueness constraints.
6. Preserve delivery attempts for retry/audit history.
7. Keep promotion tables outside the legacy curator_settings JSON document.

## Promotion Data Model

### telegram_bot_accounts

Metadata for Telegram bots usable by promotion targets.

The table stores `credential_source` and `credential_ref`; it does not store a raw bot token.

### promotion_targets

Authorized Telegram channels/groups that a promotion campaign may use.

Each target belongs to a bot account and is unique by `(bot_account_id, chat_id)`.

### promotion_campaigns

Campaign-level metadata and lifecycle state.

States:

- draft
- ready
- running
- completed
- partial
- failed
- cancelled

### promotion_campaign_posts

Links collected TGReposter posts to a promotion campaign.

Content modes:

- original
- teaser
- ai
- custom

Each post may include custom promotion text, CTA text, and a source-link override.

### promotion_deliveries

One row per campaign-post/target pair.

The unique `(campaign_post_id, target_id)` constraint is the primary duplicate-delivery guard.

States:

- pending
- in_progress
- success
- failed
- skipped

### promotion_delivery_attempts

Append-only retry/audit records for individual delivery attempts.

## Security Boundary

All promotion tables are created with Row Level Security enabled. `anon` and `authenticated` receive no table privileges in Step 1.

Promotion APIs will therefore be server-owned. The backend will access these tables through a server-only database credential path in the next implementation stage.

This avoids exposing campaign administration, target configuration, bot credential references, or delivery history directly to browser clients.

## Target Publishing Flow

```text
Selected collected post
        |
        v
Promotion campaign post
        |
        +--> original
        +--> teaser
        +--> AI-generated promotion
        +--> custom text
        |
        v
Promotion deliveries
        |
        +--> Target A -> success
        +--> Target B -> failed -> retry attempt
        +--> Target C -> success
        |
        v
Campaign outcome: completed / partial / failed
```

## Integration Boundary

The existing `/api/post-telegram` route currently owns Telegram send orchestration. The next step is to extract that behavior behind a reusable Telegram publisher service while preserving the current endpoint contract.

Target architecture:

```text
/api/post-telegram
        |
        +--> TelegramPublisherService

/api/promotion/.../publish
        |
        +--> TelegramPublisherService
```

This keeps the existing media validation, photo/video fallback, text chunking, timeout handling, and per-target result behavior as the single implementation of Telegram delivery.

## Step 1 Completion Criteria

- Promotion database tables created in Supabase.
- Foreign keys and duplicate guards created.
- Query indexes created.
- RLS enabled on all promotion tables.
- Browser roles denied direct table access.
- No raw Telegram bot token column added.
- TypeScript promotion domain types added.
- Existing repost workflow unchanged.

## Next Step

Extract the Telegram publishing logic from `server.ts` into a reusable `TelegramPublisherService` without changing `/api/post-telegram` behavior or response shape.