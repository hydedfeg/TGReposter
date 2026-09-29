const dashboard = {
  hero: {
    eyebrow: "Content operations",
    title: "At a glance",
    description: "Review the queue, monitor delivery health, and keep Telegram publishing moving.",
  },
  actions: {
    syncSources: "Sync sources",
    syncingSources: "Syncing sources",
    viewAll: "View all",
    reviewPosts: "Review posts",
    createCampaign: "Create campaign",
  },
  metrics: {
    ariaLabel: "Workspace metrics",
    sourceChannels: "Source Channels",
    destinations: "Destinations",
    pendingReview: "Pending Review",
    publishedToday: "Published Today",
  },
  activity: {
    title: "Publication activity",
    description: "Posts published during the last seven days",
    period: "Last 7 days",
    ariaLabel: "Seven-day publication chart",
  },
  queue: {
    title: "Review queue",
    description: "Newest posts needing attention",
    mediaPost: "Media post",
    emptyTitle: "Review queue is clear",
    emptyDescription: "Sync sources to look for new matching posts.",
  },
  health: {
    title: "Publishing health",
    successRate: "Success rate",
    activeTargets: "Active targets",
    needAttention: "Need attention",
  },
  quickActions: {
    title: "Quick actions",
  },
} as const;

export default dashboard;
