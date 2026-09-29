const sources = {
  header: {
    title: "Каналы-источники",
    description: "Собирайте сообщения напрямую из публичных каналов Telegram. Учетные данные API не требуются.",
  },
  actions: {
    scrapeAll: "Собрать данные со всех каналов",
    add: "Добавить канал",
    scrapeOne: "Собрать данные с этого канала",
    remove: "Удалить канал",
  },
  form: {
    usernameLabel: "Имя Telegram-канала",
    placeholder: "durov или techcrunch",
  },
  validation: {
    usernameRequired: "Имя пользователя не может быть пустым.",
    duplicate: "Этот канал уже добавлен.",
  },
  empty: {
    title: "Нет каналов-источников",
    description: "Добавьте имя Telegram-канала выше, чтобы начать сбор контента.",
  },
  status: {
    fetching: "Сбор данных",
    scraped: "Собрано {{time}}",
    failed: "Ошибка",
  },
  accessibility: {
    channelList: "Каналы-источники",
  },
} as const;

export default sources;
