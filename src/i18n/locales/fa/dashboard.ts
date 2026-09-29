const dashboard = {
  hero: {
    eyebrow: "مدیریت محتوا",
    title: "نمای کلی",
    description: "صف بررسی را مدیریت کنید، وضعیت ارسال را ببینید و انتشار در تلگرام را روان نگه دارید.",
  },
  actions: {
    syncSources: "همگام‌سازی منابع",
    syncingSources: "در حال همگام‌سازی منابع",
    viewAll: "مشاهده همه",
    reviewPosts: "بررسی پست‌ها",
    createCampaign: "ساخت کمپین",
  },
  metrics: {
    ariaLabel: "شاخص‌های فضای کاری",
    sourceChannels: "کانال‌های منبع",
    destinations: "مقصدها",
    pendingReview: "در انتظار بررسی",
    publishedToday: "منتشرشده امروز",
  },
  activity: {
    title: "فعالیت انتشار",
    description: "پست‌های منتشرشده در هفت روز گذشته",
    period: "۷ روز گذشته",
    ariaLabel: "نمودار انتشار هفت‌روزه",
  },
  queue: {
    title: "صف بررسی",
    description: "جدیدترین پست‌هایی که نیاز به بررسی دارند",
    mediaPost: "پست رسانه‌ای",
    emptyTitle: "صف بررسی خالی است",
    emptyDescription: "برای یافتن پست‌های جدید مطابق، منابع را همگام‌سازی کنید.",
  },
  health: {
    title: "وضعیت انتشار",
    successRate: "نرخ موفقیت",
    activeTargets: "مقصدهای فعال",
    needAttention: "نیازمند توجه",
  },
  quickActions: {
    title: "اقدامات سریع",
  },
} as const;

export default dashboard;
