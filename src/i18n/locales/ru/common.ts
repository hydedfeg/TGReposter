const common = {
  app: {
    name: "TGReposter",
  },
  languages: {
    en: "Английский",
    ru: "Русский",
    ar: "Арабский",
    fa: "Персидский",
  },
  aiLanguages: {
    en: "Английский",
    es: "Испанский",
    ru: "Русский",
    fr: "Французский",
    de: "Немецкий",
    zh: "Китайский",
    ar: "Арабский",
    fa: "Персидский",
  },
  runtime: {
    loading: {
      sessionTitle: "Проверка сессии",
      sessionDescription: "TGReposter безопасно проверяет ваш доступ.",
      workspaceTitle: "Открытие рабочего пространства",
      workspaceDescription: "Загружаются источники, публикации, назначения и статус публикации.",
    },
    footer: {
      secureOperations: "Безопасная работа с контентом Telegram",
    },
    notice: "Уведомление",
    publishingSetup: {
      title: "Требуется настройка публикации",
      description: "Сбор и редактирование контента доступны. Перед публикацией настройте и включите назначение Telegram.",
      action: "Настроить мои назначения",
    },
    errors: {
      settingsCached: "Не удалось получить настройки с сервера. Показано сохранённое рабочее пространство.",
      settingsUnavailable: "Не удалось загрузить рабочее пространство. Войдите снова и повторите попытку.",
      sessionVerify: "Не удалось проверить сессию. Войдите снова.",
      configPersist: "Конфигурация сохранена локально, но сервер не смог её сохранить.",
    },
    auth: {
      ownerReady: "Аккаунт суперадминистратора настроен! Рабочее пространство разблокировано.",
      welcome: "Добро пожаловать, {{username}}! Рабочее пространство разблокировано.",
    },
    users: {
      registered: "Пользователь «{{username}}» успешно зарегистрирован.",
      revoked: "Доступ пользователя «{{username}}» отозван.",
      addFailed: "Не удалось добавить пользователя",
      revokeFailed: "Не удалось отозвать доступ пользователя",
    },
    channels: {
      added: "Канал @{{username}} добавлен! Публикации загружаются автоматически…",
      removed: "Канал @{{username}} удалён",
      fetching: "Загрузка ленты @{{username}}…",
      fetched: "Сбор завершён! Публикации @{{username}} получены.",
      fetchFailed: "Не удалось собрать @{{username}}: {{error}}",
      allFetching: "Запускается сбор всех целевых лент…",
      allFetched_one: "Сбор завершён! Найдена {{formattedCount}} новая публикация по правилам.",
      allFetched_few: "Сбор завершён! Найдено {{formattedCount}} новые публикации по правилам.",
      allFetched_many: "Сбор завершён! Найдено {{formattedCount}} новых публикаций по правилам.",
      allFetched_other: "Сбор завершён! Найдено {{formattedCount}} новой публикации по правилам.",
      allFailed: "Ошибка сбора: {{error}}",
    },
    filters: {
      updated: "Критерии фильтрации успешно обновлены.",
    },
    destinations: {
      tokenStoreFailed: "Не удалось сохранить токен Telegram-бота.",
      tokenStored: "Токен Telegram-бота безопасно сохранён, назначения обновлены.",
      updated: "Назначения Telegram обновлены.",
    },
    ai: {
      updated: "Конфигурация ИИ успешно обновлена.",
    },
    publishing: {
      success: "Публикация успешно отправлена в ваш канал!",
      failed: "Telegram не смог опубликовать сообщение.",
      botError: "Ошибка Telegram-бота: {{error}}",
    },
  },
  languageSelector: {
    label: "Язык интерфейса",
  },
} as const;

export default common;
