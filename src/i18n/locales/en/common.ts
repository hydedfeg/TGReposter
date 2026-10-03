const common = {
  app: {
    name: "TGReposter",
  },
  languages: {
    en: "English",
    ru: "Russian",
    ar: "Arabic",
    fa: "Persian",
  },
  aiLanguages: {
    en: "English",
    es: "Spanish",
    ru: "Russian",
    fr: "French",
    de: "German",
    zh: "Chinese",
    ar: "Arabic",
    fa: "Persian",
  },
  runtime: {
    loading: {
      sessionTitle: "Checking your session",
      sessionDescription: "TGReposter is securely verifying your access.",
      workspaceTitle: "Opening your workspace",
      workspaceDescription: "Loading sources, posts, destinations, and publishing status.",
    },
    footer: {
      secureOperations: "Secure Telegram content operations",
    },
    notice: "Notice",
    publishingSetup: {
      title: "Publishing setup required",
      description: "Content collection and editing are available. Configure and enable a Telegram destination before publishing.",
      action: "Configure my destinations",
    },
    errors: {
      settingsCached: "Unable to fetch settings from server. Showing your saved workspace.",
      settingsUnavailable: "Unable to load your workspace. Please sign in again to retry.",
      sessionVerify: "Unable to verify your session. Please sign in again.",
      configPersist: "Config saved locally, but server failed to persist.",
      sessionChanged: "Session changed. Please reopen your workspace.",
    },
    auth: {
      ownerReady: "Super-admin account set! Workspace unlocked.",
      welcome: "Welcome, {{username}}! Workspace unlocked.",
    },
    users: {
      registered: "User \"{{username}}\" successfully registered.",
      revoked: "User \"{{username}}\" access revoked.",
      addFailed: "Unable to add user",
      revokeFailed: "Unable to revoke user access",
    },
    channels: {
      added: "Added channel @{{username}}! Automatically fetching posts…",
      removed: "Removed channel @{{username}}",
      fetching: "Fetching feed for @{{username}}…",
      fetched: "Scrape completed! Collected posts for @{{username}}.",
      serverFetchFailed: "Server failed to scrape the channel.",
      serverFetchAllFailed: "Server failed to scrape channels.",
      fetchFailed: "Scrape failed for @{{username}}: {{error}}",
      allFetching: "Initiating scraping for all target feeds…",
      allFetched_one: "Feed scrape complete! Found {{formattedCount}} new post matching rules.",
      allFetched_other: "Feed scrape complete! Found {{formattedCount}} new posts matching rules.",
      allFailed: "Scrape error: {{error}}",
    },
    filters: {
      updated: "Filtering criteria updated successfully.",
    },
    destinations: {
      tokenStoreFailed: "Unable to store Telegram bot token.",
      tokenStored: "Telegram bot token stored securely and destinations updated.",
      updated: "Telegram destinations updated.",
    },
    ai: {
      updated: "AI configuration updated successfully.",
    },
    publishing: {
      success: "Post dispatched successfully to your channel!",
      failed: "Telegram failed to post message.",
      botError: "Telegram Bot Error: {{error}}",
      errors: {
        postNotFound: "This post is no longer available in your Content Inbox.",
        postNotApproved: "Approve this Content Inbox post before publishing it.",
        destinationsLoadFailed: "Your Telegram destinations could not be loaded.",
        credentialLoadFailed: "Your Telegram bot credential could not be loaded.",
        botNotConfigured: "Configure a Telegram bot for your account before publishing.",
        targetIdsInvalid: "The selected Telegram destinations are invalid.",
        targetIdInvalid: "One or more selected Telegram destinations are invalid.",
        noTargetsSelected: "Select at least one Telegram destination.",
        unknownTargets: "One or more selected Telegram destinations no longer exist.",
        disabledTargets: "One or more selected Telegram destinations are disabled.",
        noEnabledTargets: "No enabled Telegram destinations are available for publishing.",
        inboxStateSaveFailed: "Telegram delivery completed, but your Content Inbox status could not be saved.",
      },
    },
  },
  languageSelector: {
    label: "Interface language",
  },
} as const;

export default common;
