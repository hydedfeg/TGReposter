const marketing = {
  meta: {
    title: "TGReposter — AI-powered Telegram content operations",
    description: "Collect, filter, refine, review, and publish Telegram content from one private workspace.",
  },
  accessibility: {
    home: "TGReposter home",
    mainNavigation: "Main navigation",
    mobileNavigation: "Mobile navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    flowImage: "Abstract content flow moving through AI processing to Telegram destinations",
  },
  nav: {
    workflow: "How it works",
    capabilities: "Capabilities",
    security: "Security",
    dashboard: "Open dashboard",
  },
  hero: {
    badge: "AI-powered Telegram content operations",
    title: "Turn Telegram noise into a publishing signal.",
    body: "Monitor the channels that matter, refine posts with AI, and publish approved content to every Telegram destination from one private workspace.",
    primary: "Open your workspace",
    secondary: "See the workflow",
    humanApproved: "Human-approved publishing",
    isolated: "User-isolated workspaces",
    stack: "Built for your stack",
  },
  workflow: {
    eyebrow: "One continuous workflow",
    title: "From source channel to published post.",
    body: "TGReposter keeps collection, filtering, AI enhancement, editorial review, and delivery in one traceable flow—without handing publishing decisions to automation.",
    collect: { title: "Collect", copy: "Watch the public Telegram channels that matter to you." },
    filter: { title: "Filter", copy: "Keep useful posts and remove noise with your own rules." },
    refine: { title: "Refine", copy: "Rewrite, summarize, translate, and create hashtags with AI." },
    publish: { title: "Publish", copy: "Review once, then send to one or many Telegram destinations." },
  },
  inbox: {
    title: "Content Inbox",
    status: "Ready for review",
    matched: "12 matched",
    now: "Now",
    first: { title: "AI infrastructure update", action: "News" },
    second: { title: "Open source model release", action: "Translate" },
    third: { title: "Telegram ecosystem report", action: "Summary" },
  },
  capabilities: {
    eyebrow: "Your editorial control room",
    title: "Automation where it helps. Human judgment where it matters.",
    body: "Use AI to move faster without losing control of your voice. Every post stays editable and reviewable before it reaches your audience.",
    items: {
      privateInbox: "Private content inbox for every user",
      aiProviders: "Gemini and OpenRouter support",
      humanReview: "Human review before publishing",
      multiDestination: "Parallel multi-destination delivery",
      campaigns: "Channel, group, and supergroup campaigns",
      roles: "Role-based team access",
    },
  },
  cards: {
    curation: {
      eyebrow: "Content curation",
      title: "Build a focused feed from the channels you monitor.",
      body: "Collect matching posts, remove unwanted promotions, improve the writing, and publish only what deserves attention.",
    },
    campaign: {
      eyebrow: "Campaign distribution",
      title: "Carry one approved message across your Telegram network.",
      body: "Coordinate delivery to channels, groups, and supergroups while keeping destination results independent.",
    },
  },
  security: {
    eyebrow: "Private by design",
    title: "Your workspace is yours.",
    body: "Sources, filters, inbox posts, destinations, campaigns, and AI preferences are isolated per user. Sensitive credentials stay on the backend, protected by authenticated, role-aware access.",
  },
  cta: {
    eyebrow: "Ready when you are",
    title: "Make your Telegram workflow feel intentional.",
    body: "Open your private dashboard to configure sources, review your content inbox, and publish with confidence.",
    button: "Go to dashboard",
  },
  footer: {
    workflow: "Workflow",
    capabilities: "Capabilities",
    security: "Security",
    dashboard: "Dashboard",
  },
} as const;

export default marketing;
