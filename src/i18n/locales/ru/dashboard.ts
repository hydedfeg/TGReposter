const dashboard = {
  hero: {
    eyebrow: "Работа с контентом",
    title: "Краткий обзор",
    description: "Проверяйте очередь, следите за доставкой и поддерживайте публикацию в Telegram.",
  },
  actions: {
    syncSources: "Синхронизировать источники",
    syncingSources: "Синхронизация источников",
    viewAll: "Показать все",
    reviewPosts: "Проверить публикации",
    createCampaign: "Создать кампанию",
  },
  metrics: {
    ariaLabel: "Показатели рабочего пространства",
    sourceChannels: "Каналы-источники",
    destinations: "Каналы назначения",
    pendingReview: "Ожидают проверки",
    publishedToday: "Опубликовано сегодня",
  },
  activity: {
    title: "Активность публикаций",
    description: "Публикации за последние семь дней",
    period: "Последние 7 дней",
    ariaLabel: "График публикаций за семь дней",
  },
  queue: {
    title: "Очередь проверки",
    description: "Новые публикации, требующие внимания",
    mediaPost: "Медиапубликация",
    emptyTitle: "Очередь проверки пуста",
    emptyDescription: "Синхронизируйте источники, чтобы найти новые подходящие публикации.",
  },
  health: {
    title: "Состояние публикации",
    successRate: "Успешная доставка",
    activeTargets: "Активные назначения",
    needAttention: "Требуют внимания",
  },
  quickActions: {
    title: "Быстрые действия",
  },
} as const;

export default dashboard;
