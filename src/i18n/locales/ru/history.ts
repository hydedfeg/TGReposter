const history = {
  header: {
    title: "История публикаций",
    description: "Просматривайте публикации, уже отправленные в Telegram, и сохранённые предупреждения о доставке.",
  },
  search: {
    label: "Поиск в истории публикаций",
    placeholder: "Поиск опубликованных постов или каналов",
  },
  empty: {
    title: "Опубликованных постов пока нет",
    description: "Посты появятся здесь после одобрения и успешной публикации в Telegram.",
    search: "В истории нет публикаций по этому запросу. Попробуйте другой канал или фразу.",
  },
  queue: {
    title: "Опубликованные посты",
    count_one: "{{formattedCount}} опубликованный пост",
    count_few: "{{formattedCount}} опубликованных поста",
    count_many: "{{formattedCount}} опубликованных постов",
    count_other: "{{formattedCount}} опубликованного поста",
  },
  details: {
    publishedVersion: "Опубликованная версия",
    publishedAt: "Опубликовано {{date}}",
    deliveryStatus: "Статус доставки",
    delivered: "Опубликовано успешно",
    deliveredWithWarnings: "Опубликовано с предупреждениями о доставке",
    deliveryNote: "Примечание о доставке",
    noTimestamp: "Время публикации недоступно",
  },
  mobile: {
    title: "Опубликованный пост",
    modeLabel: "Режим истории",
    modes: {
      original: "Оригинал",
      edit: "Опубликовано",
      preview: "Предпросмотр",
    },
  },
  accessibility: {
    historyList: "Список истории публикаций",
    publishedEditor: "Сведения об опубликованном посте",
  },
} as const;

export default history;
