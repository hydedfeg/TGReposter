const dashboard = {
  hero: {
    eyebrow: "عمليات المحتوى",
    title: "نظرة سريعة",
    description: "راجع قائمة الانتظار، وراقب سلامة التسليم، وحافظ على استمرار النشر في تيليجرام.",
  },
  actions: {
    syncSources: "مزامنة المصادر",
    syncingSources: "جارٍ مزامنة المصادر",
    viewAll: "عرض الكل",
    reviewPosts: "مراجعة المنشورات",
    createCampaign: "إنشاء حملة",
  },
  metrics: {
    ariaLabel: "مؤشرات مساحة العمل",
    sourceChannels: "قنوات المصدر",
    destinations: "وجهات النشر",
    pendingReview: "بانتظار المراجعة",
    publishedToday: "نُشر اليوم",
  },
  activity: {
    title: "نشاط النشر",
    description: "المنشورات التي نُشرت خلال الأيام السبعة الماضية",
    period: "آخر 7 أيام",
    ariaLabel: "مخطط النشر لسبعة أيام",
  },
  queue: {
    title: "قائمة المراجعة",
    description: "أحدث المنشورات التي تحتاج إلى اهتمام",
    mediaPost: "منشور وسائط",
    emptyTitle: "قائمة المراجعة فارغة",
    emptyDescription: "زامن المصادر للبحث عن منشورات جديدة مطابقة.",
  },
  health: {
    title: "سلامة النشر",
    successRate: "معدل النجاح",
    activeTargets: "الوجهات النشطة",
    needAttention: "تحتاج إلى اهتمام",
  },
  quickActions: {
    title: "إجراءات سريعة",
  },
} as const;

export default dashboard;
