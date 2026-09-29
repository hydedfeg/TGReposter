const ai = {
  header: {
    title: "موتور پردازش محتوا با هوش مصنوعی",
    description: "مدل زبانی مورد استفاده برای بازنویسی، ترجمه و استخراج هشتگ از پست‌ها را تنظیم کنید.",
  },
  providers: {
    label: "ارائه‌دهنده هوش مصنوعی را انتخاب کنید",
    geminiDescription: "مجموعه‌ای سریع و توانمند از مدل‌های Google AI.",
    openrouterDescription: "دسترسی به مدل‌های زبانی متن‌باز و تجاری از طریق یک نقطه اتصال واحد.",
    enabled: "فعال",
    missingSecret: "سکرت تنظیم نشده است",
    select: "انتخاب {{provider}}",
    secretHelpPrefix: "برای تغییر کلیدهای API،",
    secretHelpMiddle: "یا",
    secretHelpSuffix: "را در سکرت‌های محیط استقرار تنظیم کنید. کلیدهای API از مرورگر قابل ثبت نیستند.",
  },
  models: {
    label: "مدل هوش مصنوعی را انتخاب کنید",
    custom: "مدل سفارشی…",
    customInputLabel: "شناسه مدل سفارشی",
    customPlaceholder: "مثلاً meta-llama/llama-3.1-405b-instruct",
    apply: "اعمال",
    current: "مدل فعال فعلی هوش مصنوعی:",
    select: "انتخاب مدل {{model}}",
  },
  playground: {
    title: "محیط آزمایش هوش مصنوعی",
    description: "ارائه‌دهنده فعال و مدل انتخاب‌شده را آزمایش کنید. متن نمونه از مسیر معمول پردازش سمت سرور و با زمینه بازنویسی خلاق و وایرال ارسال می‌شود.",
    inputLabel: "متن نمونه",
    placeholder: "متن آزمایشی را اینجا وارد کنید…",
    sample: "جمع‌آوری پست‌های کانال‌های تلگرام روش مناسبی برای تهیه خبرنامه‌های تخصصی است.",
    output: "خروجی پردازش‌شده",
    error: "خطای پردازش",
    testing: "در حال آزمایش اتصال هوش مصنوعی…",
    run: "اجرای آزمایش هوش مصنوعی",
  },
  errors: {
    generationFallback: "هوش مصنوعی نتوانست پاسخ آزمایشی تولید کند.",
    connectionFallback: "اتصال ناموفق بود. کلید API و تنظیمات ارائه‌دهنده را بررسی کنید.",
  },
} as const;

export default ai;
