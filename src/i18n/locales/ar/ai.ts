const ai = {
  header: {
    title: "محرك تنسيق المحتوى بالذكاء الاصطناعي",
    description: "اضبط نموذج اللغة المستخدم لإعادة صياغة المنشورات وترجمتها واستخراج الوسوم منها.",
  },
  providers: {
    label: "اختر مزود الذكاء الاصطناعي",
    geminiDescription: "مجموعة سريعة وعالية القدرة من نماذج Google AI.",
    openrouterDescription: "الوصول إلى نماذج لغوية مفتوحة وتجارية من خلال نقطة وصول موحدة.",
    enabled: "مفعّل",
    missingSecret: "السر غير مُعد",
    select: "اختيار {{provider}}",
    secretHelpPrefix: "لتغيير مفاتيح API، قم بإعداد",
    secretHelpMiddle: "أو",
    secretHelpSuffix: "ضمن أسرار بيئة النشر. لا يمكن كتابة مفاتيح API من المتصفح.",
  },
  models: {
    label: "اختر نموذج الذكاء الاصطناعي",
    custom: "نموذج مخصص…",
    customInputLabel: "معرّف النموذج المخصص",
    customPlaceholder: "مثال: meta-llama/llama-3.1-405b-instruct",
    apply: "تطبيق",
    current: "نموذج الذكاء الاصطناعي النشط حاليًا:",
    select: "اختيار النموذج {{model}}",
  },
  playground: {
    title: "ساحة اختبار الذكاء الاصطناعي",
    description: "اختبر مزود الذكاء الاصطناعي النشط والنموذج المحدد. يُرسل النص عبر مسار التنسيق المعتاد على الخادم باستخدام سياق إعادة صياغة إبداعي وقابل للانتشار.",
    inputLabel: "نص عينة للاختبار",
    placeholder: "ألصق نصًا للاختبار هنا…",
    sample: "يساعد جمع منشورات قنوات تيليجرام في إعداد نشرات إخبارية متخصصة.",
    output: "الناتج المنسق",
    error: "خطأ في التنسيق",
    testing: "جارٍ اختبار اتصال الذكاء الاصطناعي…",
    run: "تشغيل اختبار الذكاء الاصطناعي",
  },
  errors: {
    generationFallback: "تعذر على الذكاء الاصطناعي إنشاء استجابة اختبار.",
    connectionFallback: "فشل الاتصال. تحقق من مفتاح API وإعدادات المزود.",
  },
} as const;

export default ai;
