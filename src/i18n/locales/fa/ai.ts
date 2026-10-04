const ai = {
  header: {
    title: "موتور پردازش محتوا با هوش مصنوعی",
    description: "مدل زبانی مورد استفاده برای بازنویسی، ترجمه و استخراج هشتگ از پست‌ها را تنظیم کنید.",
  },
  providers: {
    label: "ارائه‌دهنده هوش مصنوعی را انتخاب کنید",
    geminiDescription: "مجموعه‌ای سریع و توانمند از مدل‌های Google AI.",
    openrouterDescription: "دسترسی به مدل‌های زبانی متن‌باز و تجاری از طریق یک نقطه اتصال واحد.",
    personalCredential: "کلید API شما",
    enabled: "کلید شخصی آماده است",
    missingSecret: "کلید API را اضافه کنید",
    select: "انتخاب {{provider}}",
  },
  credentials: {
    title: "اعتبارنامه API شخصی",
    description: "این کلید {{provider}} فقط به حساب شما تعلق دارد و فقط برای درخواست‌های هوش مصنوعی شما استفاده می‌شود.",
    label: "کلید API {{provider}}",
    placeholder: "کلید API {{provider}} خود را وارد کنید",
    save: "ذخیره کلید شخصی",
    saving: "در حال ذخیره…",
    saved: "کلید {{provider}} به‌صورت امن ذخیره شد.",
    security: "کلید فقط به بک‌اند ارسال می‌شود، در Supabase Vault ذخیره می‌شود و هرگز به مرورگر برگردانده نمی‌شود.",
    saveError: "ذخیره کلید API شما انجام نشد.",
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
    credentialRequired: "پیش از اجرای آزمایش، کلید API شخصی {{provider}} را اضافه کنید.",
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
