const sources = {
  header: {
    title: "کانال‌های منبع",
    description: "پیام‌ها را مستقیماً از کانال‌های عمومی تلگرام جمع‌آوری کنید. به اطلاعات API نیازی نیست.",
  },
  actions: {
    scrapeAll: "جمع‌آوری از همه کانال‌ها",
    add: "افزودن کانال",
    scrapeOne: "جمع‌آوری از این کانال",
    remove: "حذف کانال",
  },
  form: {
    usernameLabel: "نام کاربری کانال تلگرام",
    placeholder: "durov یا techcrunch",
  },
  validation: {
    usernameRequired: "نام کاربری نمی‌تواند خالی باشد.",
    duplicate: "این کانال از قبل وجود دارد.",
  },
  empty: {
    title: "کانال منبعی وجود ندارد",
    description: "برای شروع جمع‌آوری محتوا، نام کاربری یک کانال تلگرام را در بالا اضافه کنید.",
  },
  status: {
    fetching: "در حال جمع‌آوری",
    scraped: "جمع‌آوری‌شده در {{time}}",
    failed: "ناموفق",
  },
  accessibility: {
    channelList: "کانال‌های منبع",
  },
} as const;

export default sources;
