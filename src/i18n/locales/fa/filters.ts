const filters = {
  header: {
    title: "فیلترهای محتوا",
    description: "پست‌های مطابق وارد صف «در انتظار بررسی» می‌شوند و پست‌های نامطابق مستقیماً به بایگانی می‌روند.",
  },
  caseSensitive: {
    label: "حساس به بزرگی و کوچکی حروف",
    enabled: "تطبیق حساس به بزرگی و کوچکی حروف فعال است",
    disabled: "تطبیق حساس به بزرگی و کوچکی حروف غیرفعال است",
  },
  positive: {
    label: "کلیدواژه‌های مثبت (شروع پردازش)",
    inputLabel: "افزودن کلیدواژه یا عبارت مثبت",
    placeholder: "مثلاً AI، startup، benchmark",
    empty: "هنوز کلیدواژه مثبتی اضافه نشده است. اگر هیچ کلیدواژه یا هشتگی تعریف نشده باشد، همه پست‌های جمع‌آوری‌شده مطابق در نظر گرفته می‌شوند.",
    remove: "حذف کلیدواژه مثبت {{value}}",
  },
  hashtags: {
    label: "هشتگ‌های الزامی",
    inputLabel: "افزودن هشتگ الزامی",
    placeholder: "tech، ai، health",
    empty: "هنوز هشتگ الزامی اضافه نشده است.",
    remove: "حذف هشتگ {{value}}",
  },
  negative: {
    label: "کلیدواژه‌های منفی (نادیده‌گیری/بایگانی فوری)",
    inputLabel: "افزودن کلیدواژه یا عبارت منفی",
    placeholder: "مثلاً promo، airdrop، crypto، spam",
    empty: "هنوز کلیدواژه منفی اضافه نشده است. عباراتی مانند «spam» یا «ad» را برای حذف خودکار پست‌های مطابق اضافه کنید.",
    remove: "حذف کلیدواژه منفی {{value}}",
  },
  actions: {
    addPositive: "افزودن کلیدواژه مثبت",
    addHashtag: "افزودن هشتگ الزامی",
    addNegative: "افزودن کلیدواژه منفی",
  },
} as const;

export default filters;
