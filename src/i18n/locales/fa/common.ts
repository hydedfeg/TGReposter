const common = {
  app: {
    name: "TGReposter",
  },
  languages: {
    en: "انگلیسی",
    ru: "روسی",
    ar: "عربی",
    fa: "فارسی",
  },
  aiLanguages: {
    en: "انگلیسی",
    es: "اسپانیایی",
    ru: "روسی",
    fr: "فرانسوی",
    de: "آلمانی",
    zh: "چینی",
    ar: "عربی",
    fa: "فارسی",
  },
  runtime: {
    loading: {
      sessionTitle: "در حال بررسی نشست شما",
      sessionDescription: "TGReposter در حال بررسی امن دسترسی شماست.",
      workspaceTitle: "در حال باز کردن فضای کاری",
      workspaceDescription: "منابع، پست‌ها، مقصدها و وضعیت انتشار در حال بارگذاری هستند.",
    },
    footer: {
      secureOperations: "عملیات امن محتوای تلگرام",
    },
    notice: "اعلان",
    publishingSetup: {
      title: "تنظیم انتشار لازم است",
      description: "جمع‌آوری و ویرایش محتوا در دسترس است. پیش از انتشار، یک مقصد تلگرام را تنظیم و فعال کنید.",
      action: "تنظیم مقصدهای من",
    },
    errors: {
      settingsCached: "دریافت تنظیمات از سرور ممکن نشد. فضای کاری ذخیره‌شده نمایش داده می‌شود.",
      settingsUnavailable: "بارگذاری فضای کاری ممکن نشد. دوباره وارد شوید و تلاش کنید.",
      sessionVerify: "بررسی نشست ممکن نشد. دوباره وارد شوید.",
      configPersist: "تنظیمات محلی ذخیره شد، اما سرور نتوانست آن را ذخیره کند.",
    },
    auth: {
      ownerReady: "حساب مدیر ارشد تنظیم شد! فضای کاری باز شد.",
      welcome: "خوش آمدید {{username}}! فضای کاری باز شد.",
    },
    users: {
      registered: "کاربر «{{username}}» با موفقیت ثبت شد.",
      revoked: "دسترسی کاربر «{{username}}» لغو شد.",
      addFailed: "افزودن کاربر ممکن نشد",
      revokeFailed: "لغو دسترسی کاربر ممکن نشد",
    },
    channels: {
      added: "کانال @{{username}} اضافه شد! پست‌ها به‌طور خودکار دریافت می‌شوند…",
      removed: "کانال @{{username}} حذف شد",
      fetching: "در حال دریافت فید @{{username}}…",
      fetched: "جمع‌آوری کامل شد! پست‌های @{{username}} دریافت شدند.",
      fetchFailed: "جمع‌آوری @{{username}} ناموفق بود: {{error}}",
      allFetching: "جمع‌آوری همه فیدهای هدف در حال شروع است…",
      allFetched_one: "جمع‌آوری کامل شد! {{formattedCount}} پست جدید مطابق قوانین پیدا شد.",
      allFetched_other: "جمع‌آوری کامل شد! {{formattedCount}} پست جدید مطابق قوانین پیدا شد.",
      allFailed: "خطای جمع‌آوری: {{error}}",
    },
    filters: {
      updated: "معیارهای فیلتر با موفقیت به‌روزرسانی شدند.",
    },
    destinations: {
      tokenStoreFailed: "ذخیره توکن ربات تلگرام ممکن نشد.",
      tokenStored: "توکن ربات تلگرام به‌صورت امن ذخیره و مقصدها به‌روزرسانی شدند.",
      updated: "مقصدهای تلگرام به‌روزرسانی شدند.",
    },
    ai: {
      updated: "تنظیمات هوش مصنوعی با موفقیت به‌روزرسانی شد.",
    },
    publishing: {
      success: "پست با موفقیت به کانال شما ارسال شد!",
      failed: "تلگرام نتوانست پیام را منتشر کند.",
      botError: "خطای ربات تلگرام: {{error}}",
    },
  },
  languageSelector: {
    label: "زبان رابط کاربری",
  },
} as const;

export default common;
