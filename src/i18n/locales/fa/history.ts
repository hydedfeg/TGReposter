const history = {
  header: {
    title: "تاریخچه انتشار",
    description: "پست‌های ارسال‌شده به تلگرام و هشدارهای ثبت‌شده درباره ارسال را بررسی کنید.",
  },
  search: {
    label: "جست‌وجو در تاریخچه انتشار",
    placeholder: "جست‌وجوی پست‌های منتشرشده یا کانال‌ها",
  },
  empty: {
    title: "هنوز پستی منتشر نشده است",
    description: "پست‌ها پس از تأیید و انتشار موفق در تلگرام اینجا نمایش داده می‌شوند.",
    search: "هیچ پست منتشرشده‌ای با این جست‌وجو مطابقت ندارد. کانال یا عبارت دیگری را امتحان کنید.",
  },
  queue: {
    title: "پست‌های منتشرشده",
    count_one: "{{formattedCount}} پست منتشرشده",
    count_other: "{{formattedCount}} پست منتشرشده",
  },
  details: {
    publishedVersion: "نسخه منتشرشده",
    publishedAt: "منتشرشده در {{date}}",
    deliveryStatus: "وضعیت ارسال",
    delivered: "با موفقیت منتشر شد",
    deliveredWithWarnings: "با هشدارهای ارسال منتشر شد",
    deliveryNote: "یادداشت ارسال",
    noTimestamp: "زمان انتشار در دسترس نیست",
  },
  mobile: {
    title: "پست منتشرشده",
    modeLabel: "نمای تاریخچه",
    modes: {
      original: "اصلی",
      edit: "منتشرشده",
      preview: "پیش‌نمایش",
    },
  },
  accessibility: {
    historyList: "فهرست تاریخچه انتشار",
    publishedEditor: "جزئیات پست منتشرشده",
  },
} as const;

export default history;
