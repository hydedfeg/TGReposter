const common = {
  app: {
    name: "TGReposter",
  },
  languages: {
    en: "الإنجليزية",
    ru: "الروسية",
    ar: "العربية",
    fa: "الفارسية",
  },
  aiLanguages: {
    en: "الإنجليزية",
    es: "الإسبانية",
    ru: "الروسية",
    fr: "الفرنسية",
    de: "الألمانية",
    zh: "الصينية",
    ar: "العربية",
    fa: "الفارسية",
  },
  runtime: {
    loading: {
      sessionTitle: "جارٍ التحقق من جلستك",
      sessionDescription: "يتحقق TGReposter من صلاحية وصولك بأمان.",
      workspaceTitle: "جارٍ فتح مساحة العمل",
      workspaceDescription: "جارٍ تحميل المصادر والمنشورات والوجهات وحالة النشر.",
    },
    footer: {
      secureOperations: "عمليات آمنة لمحتوى تيليجرام",
    },
    notice: "تنبيه",
    publishingSetup: {
      title: "إعداد النشر مطلوب",
      description: "جمع المحتوى وتحريره متاحان. قم بإعداد وجهة تيليجرام وتفعيلها قبل النشر.",
      action: "إعداد وجهاتي",
    },
    errors: {
      settingsCached: "تعذر جلب الإعدادات من الخادم. يتم عرض مساحة العمل المحفوظة.",
      settingsUnavailable: "تعذر تحميل مساحة العمل. سجّل الدخول مرة أخرى للمحاولة.",
      sessionVerify: "تعذر التحقق من الجلسة. سجّل الدخول مرة أخرى.",
      configPersist: "تم حفظ الإعداد محليًا، لكن الخادم لم يتمكن من حفظه.",
      sessionChanged: "تغيرت الجلسة. أعد فتح مساحة العمل.",
    },
    auth: {
      ownerReady: "تم إعداد حساب المشرف العام! أصبحت مساحة العمل متاحة.",
      welcome: "مرحبًا {{username}}! أصبحت مساحة العمل متاحة.",
    },
    users: {
      registered: "تم تسجيل المستخدم «{{username}}» بنجاح.",
      revoked: "تم إلغاء وصول المستخدم «{{username}}».",
      addFailed: "تعذر إضافة المستخدم",
      revokeFailed: "تعذر إلغاء وصول المستخدم",
    },
    channels: {
      added: "تمت إضافة القناة @{{username}}! جارٍ جلب المنشورات تلقائيًا…",
      removed: "تمت إزالة القناة @{{username}}",
      fetching: "جارٍ جلب موجز @{{username}}…",
      fetched: "اكتمل الجمع! تم جلب منشورات @{{username}}.",
      serverFetchFailed: "تعذر على الخادم جمع منشورات القناة.",
      serverFetchAllFailed: "تعذر على الخادم جمع منشورات القنوات.",
      fetchFailed: "فشل جمع @{{username}}: {{error}}",
      allFetching: "جارٍ بدء جمع جميع الموجزات المستهدفة…",
      allFetched_zero: "اكتمل الجمع! لم يتم العثور على منشورات جديدة مطابقة للقواعد.",
      allFetched_one: "اكتمل الجمع! تم العثور على منشور جديد واحد مطابق للقواعد.",
      allFetched_two: "اكتمل الجمع! تم العثور على منشورين جديدين مطابقين للقواعد.",
      allFetched_few: "اكتمل الجمع! تم العثور على {{formattedCount}} منشورات جديدة مطابقة للقواعد.",
      allFetched_many: "اكتمل الجمع! تم العثور على {{formattedCount}} منشورًا جديدًا مطابقًا للقواعد.",
      allFetched_other: "اكتمل الجمع! تم العثور على {{formattedCount}} منشور جديد مطابق للقواعد.",
      allFailed: "خطأ في الجمع: {{error}}",
    },
    filters: {
      updated: "تم تحديث معايير التصفية بنجاح.",
    },
    destinations: {
      tokenStoreFailed: "تعذر حفظ رمز بوت تيليجرام.",
      tokenStored: "تم حفظ رمز بوت تيليجرام بأمان وتحديث الوجهات.",
      updated: "تم تحديث وجهات تيليجرام.",
    },
    ai: {
      updated: "تم تحديث إعدادات الذكاء الاصطناعي بنجاح.",
    },
    publishing: {
      success: "تم إرسال المنشور إلى قناتك بنجاح!",
      failed: "تعذر على تيليجرام نشر الرسالة.",
      botError: "خطأ بوت تيليجرام: {{error}}",
    },
      errors: {
        postNotFound: "لم يعد هذا المنشور متاحًا في صندوق المحتوى الخاص بك.",
        postNotApproved: "وافق على هذا المنشور في صندوق المحتوى قبل نشره.",
        destinationsLoadFailed: "تعذر تحميل وجهات Telegram الخاصة بك.",
        credentialLoadFailed: "تعذر تحميل بيانات اعتماد بوت Telegram.",
        botNotConfigured: "قم بإعداد بوت Telegram لحسابك قبل النشر.",
        targetIdsInvalid: "وجهات Telegram المحددة غير صالحة.",
        targetIdInvalid: "وجهة واحدة أو أكثر من وجهات Telegram المحددة غير صالحة.",
        noTargetsSelected: "حدد وجهة Telegram واحدة على الأقل.",
        unknownTargets: "وجهة واحدة أو أكثر من وجهات Telegram المحددة لم تعد موجودة.",
        disabledTargets: "وجهة واحدة أو أكثر من وجهات Telegram المحددة معطلة.",
        noEnabledTargets: "لا توجد وجهات Telegram مفعلة ومتاحة للنشر.",
        inboxStateSaveFailed: "اكتمل الإرسال إلى Telegram، لكن تعذر حفظ حالة صندوق المحتوى.",
      },
  },
  languageSelector: {
    label: "لغة الواجهة",
  },
} as const;

export default common;
