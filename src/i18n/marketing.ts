export type AppLocale = "en" | "ru" | "ar" | "fa";
export type TextDirection = "ltr" | "rtl";

export const supportedLocales: Record<AppLocale, {
  name: string;
  nativeName: string;
  direction: TextDirection;
}> = {
  en: { name: "English", nativeName: "English", direction: "ltr" },
  ru: { name: "Russian", nativeName: "Русский", direction: "ltr" },
  ar: { name: "Arabic", nativeName: "العربية", direction: "rtl" },
  fa: { name: "Persian", nativeName: "فارسی", direction: "rtl" },
};

type MarketingCopy = {
  meta: {
    title: string;
    description: string;
  };
  languageLabel: string;
  a11y: {
    home: string;
    openMenu: string;
    closeMenu: string;
    flowImageAlt: string;
  };
  nav: {
    workflow: string;
    capabilities: string;
    security: string;
    dashboard: string;
  };
  hero: {
    badge: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    proofApproval: string;
    proofIsolation: string;
    stackLabel: string;
  };
  workflow: {
    eyebrow: string;
    title: string;
    body: string;
    steps: Array<{ title: string; copy: string }>;
  };
  inbox: {
    title: string;
    status: string;
    matched: string;
    now: string;
    items: Array<{ source: string; title: string; action: string }>;
  };
  capabilities: {
    eyebrow: string;
    title: string;
    body: string;
    list: string[];
  };
  featureCards: {
    curation: {
      eyebrow: string;
      title: string;
      body: string;
    };
    campaign: {
      eyebrow: string;
      title: string;
      body: string;
    };
  };
  security: {
    eyebrow: string;
    title: string;
    body: string;
  };
  cta: {
    eyebrow: string;
    title: string;
    body: string;
    button: string;
  };
  footer: {
    workflow: string;
    capabilities: string;
    security: string;
    dashboard: string;
  };
};

export const marketingCopy: Record<AppLocale, MarketingCopy> = {
  en: {
    meta: {
      title: "TGReposter — AI-powered Telegram content operations",
      description: "Collect, filter, refine, review, and publish Telegram content from one private workspace.",
    },
    languageLabel: "Language",
    a11y: {
      home: "TGReposter home",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      flowImageAlt: "Abstract content flow moving through AI processing to Telegram destinations",
    },
    nav: {
      workflow: "How it works",
      capabilities: "Capabilities",
      security: "Security",
      dashboard: "Open dashboard",
    },
    hero: {
      badge: "AI-powered Telegram content operations",
      title: "Turn Telegram noise into a publishing signal.",
      body: "Monitor the channels that matter, refine posts with AI, and publish approved content to every Telegram destination from one private workspace.",
      primary: "Open your workspace",
      secondary: "See the workflow",
      proofApproval: "Human-approved publishing",
      proofIsolation: "User-isolated workspaces",
      stackLabel: "Built for your stack",
    },
    workflow: {
      eyebrow: "One continuous workflow",
      title: "From source channel to published post.",
      body: "TGReposter keeps collection, filtering, AI enhancement, editorial review, and delivery in one traceable flow—without handing publishing decisions to automation.",
      steps: [
        { title: "Collect", copy: "Watch the public Telegram channels that matter to you." },
        { title: "Filter", copy: "Keep useful posts and remove noise with your own rules." },
        { title: "Refine", copy: "Rewrite, summarize, translate, and create hashtags with AI." },
        { title: "Publish", copy: "Review once, then send to one or many Telegram destinations." },
      ],
    },
    inbox: {
      title: "Content Inbox",
      status: "Ready for review",
      matched: "12 matched",
      now: "Now",
      items: [
        { source: "@futuretech", title: "AI infrastructure update", action: "News" },
        { source: "@digitalbrief", title: "Open source model release", action: "Translate" },
        { source: "@industrywire", title: "Telegram ecosystem report", action: "Summary" },
      ],
    },
    capabilities: {
      eyebrow: "Your editorial control room",
      title: "Automation where it helps. Human judgment where it matters.",
      body: "Use AI to move faster without losing control of your voice. Every post stays editable and reviewable before it reaches your audience.",
      list: [
        "Private content inbox for every user",
        "Gemini and OpenRouter support",
        "Human review before publishing",
        "Parallel multi-destination delivery",
        "Channel, group, and supergroup campaigns",
        "Role-based team access",
      ],
    },
    featureCards: {
      curation: {
        eyebrow: "Content curation",
        title: "Build a focused feed from the channels you monitor.",
        body: "Collect matching posts, remove unwanted promotions, improve the writing, and publish only what deserves attention.",
      },
      campaign: {
        eyebrow: "Campaign distribution",
        title: "Carry one approved message across your Telegram network.",
        body: "Coordinate delivery to channels, groups, and supergroups while keeping destination results independent.",
      },
    },
    security: {
      eyebrow: "Private by design",
      title: "Your workspace is yours.",
      body: "Sources, filters, inbox posts, destinations, campaigns, and AI preferences are isolated per user. Sensitive credentials stay on the backend, protected by authenticated, role-aware access.",
    },
    cta: {
      eyebrow: "Ready when you are",
      title: "Make your Telegram workflow feel intentional.",
      body: "Open your private dashboard to configure sources, review your content inbox, and publish with confidence.",
      button: "Go to dashboard",
    },
    footer: {
      workflow: "Workflow",
      capabilities: "Capabilities",
      security: "Security",
      dashboard: "Dashboard",
    },
  },
  ru: {
    meta: {
      title: "TGReposter — ИИ-платформа для работы с контентом Telegram",
      description: "Собирайте, фильтруйте, улучшайте, проверяйте и публикуйте контент Telegram из одного приватного рабочего пространства.",
    },
    languageLabel: "Язык",
    a11y: {
      home: "Главная TGReposter",
      openMenu: "Открыть меню",
      closeMenu: "Закрыть меню",
      flowImageAlt: "Абстрактный поток контента через ИИ-обработку к каналам назначения Telegram",
    },
    nav: {
      workflow: "Как это работает",
      capabilities: "Возможности",
      security: "Безопасность",
      dashboard: "Открыть панель",
    },
    hero: {
      badge: "ИИ-управление контентом Telegram",
      title: "Превратите шум Telegram в сигнал для публикации.",
      body: "Следите за важными каналами, улучшайте посты с помощью ИИ и публикуйте одобренный контент во все нужные Telegram-каналы и группы из одного приватного пространства.",
      primary: "Открыть рабочее пространство",
      secondary: "Посмотреть процесс",
      proofApproval: "Публикация только после проверки",
      proofIsolation: "Изолированные пространства пользователей",
      stackLabel: "Работает с вашим стеком",
    },
    workflow: {
      eyebrow: "Единый непрерывный процесс",
      title: "От канала-источника до опубликованного поста.",
      body: "TGReposter объединяет сбор, фильтрацию, ИИ-обработку, редакционную проверку и доставку в один прозрачный процесс, сохраняя решение о публикации за человеком.",
      steps: [
        { title: "Сбор", copy: "Следите за публичными Telegram-каналами, которые важны именно вам." },
        { title: "Фильтрация", copy: "Сохраняйте полезные посты и убирайте шум с помощью собственных правил." },
        { title: "Обработка", copy: "Переписывайте, сокращайте, переводите и создавайте хэштеги с помощью ИИ." },
        { title: "Публикация", copy: "Проверьте один раз и отправьте в одно или несколько Telegram-направлений." },
      ],
    },
    inbox: {
      title: "Входящий контент",
      status: "Готово к проверке",
      matched: "12 совпадений",
      now: "Сейчас",
      items: [
        { source: "@futuretech", title: "Обновление инфраструктуры ИИ", action: "Новости" },
        { source: "@digitalbrief", title: "Релиз модели с открытым кодом", action: "Перевод" },
        { source: "@industrywire", title: "Отчёт об экосистеме Telegram", action: "Сводка" },
      ],
    },
    capabilities: {
      eyebrow: "Ваш редакционный центр",
      title: "Автоматизация там, где она помогает. Решение человека там, где это важно.",
      body: "Используйте ИИ, чтобы работать быстрее, не теряя контроль над стилем и смыслом. Каждый пост можно отредактировать и проверить перед публикацией.",
      list: [
        "Приватный контент-инбокс для каждого пользователя",
        "Поддержка Gemini и OpenRouter",
        "Ручная проверка перед публикацией",
        "Параллельная отправка в несколько направлений",
        "Кампании для каналов, групп и супергрупп",
        "Ролевой доступ для команды",
      ],
    },
    featureCards: {
      curation: {
        eyebrow: "Кураторство контента",
        title: "Соберите сфокусированную ленту из отслеживаемых каналов.",
        body: "Собирайте подходящие посты, исключайте нежелательную рекламу, улучшайте текст и публикуйте только то, что действительно заслуживает внимания.",
      },
      campaign: {
        eyebrow: "Распространение кампаний",
        title: "Распространяйте одно одобренное сообщение по всей сети Telegram.",
        body: "Координируйте отправку в каналы, группы и супергруппы, сохраняя независимый результат для каждого направления.",
      },
    },
    security: {
      eyebrow: "Приватность по умолчанию",
      title: "Ваше рабочее пространство принадлежит только вам.",
      body: "Источники, фильтры, входящие посты, направления, кампании и настройки ИИ изолированы для каждого пользователя. Конфиденциальные данные остаются на сервере и защищены аутентификацией и ролевым доступом.",
    },
    cta: {
      eyebrow: "Готовы начать?",
      title: "Сделайте работу с Telegram управляемой и осознанной.",
      body: "Откройте приватную панель, настройте источники, проверьте входящий контент и публикуйте уверенно.",
      button: "Перейти в панель",
    },
    footer: {
      workflow: "Процесс",
      capabilities: "Возможности",
      security: "Безопасность",
      dashboard: "Панель",
    },
  },
  ar: {
    meta: {
      title: "TGReposter — منصة ذكية لإدارة محتوى Telegram",
      description: "اجمع محتوى Telegram وصفّه وحسّنه وراجعه وانشره من مساحة عمل خاصة واحدة.",
    },
    languageLabel: "اللغة",
    a11y: {
      home: "الصفحة الرئيسية لـ TGReposter",
      openMenu: "فتح القائمة",
      closeMenu: "إغلاق القائمة",
      flowImageAlt: "تدفّق تجريدي للمحتوى يمر عبر معالجة الذكاء الاصطناعي إلى وجهات Telegram",
    },
    nav: {
      workflow: "كيف يعمل",
      capabilities: "الإمكانات",
      security: "الأمان",
      dashboard: "فتح لوحة التحكم",
    },
    hero: {
      badge: "عمليات محتوى Telegram مدعومة بالذكاء الاصطناعي",
      title: "حوّل ضوضاء Telegram إلى إشارة نشر واضحة.",
      body: "راقب القنوات المهمة، وحسّن المنشورات بالذكاء الاصطناعي، وانشر المحتوى المعتمد إلى جميع وجهات Telegram من مساحة عمل خاصة واحدة.",
      primary: "افتح مساحة عملك",
      secondary: "شاهد سير العمل",
      proofApproval: "النشر بعد موافقة بشرية",
      proofIsolation: "مساحات عمل معزولة لكل مستخدم",
      stackLabel: "مصمم ليتكامل مع تقنياتك",
    },
    workflow: {
      eyebrow: "سير عمل متكامل",
      title: "من قناة المصدر إلى المنشور المنشور.",
      body: "يجمع TGReposter التحصيل والتصفية والتحسين بالذكاء الاصطناعي والمراجعة التحريرية والتوزيع في مسار واحد قابل للتتبع، مع إبقاء قرار النشر بيد الإنسان.",
      steps: [
        { title: "اجمع", copy: "راقب قنوات Telegram العامة التي تهمك." },
        { title: "صفِّ", copy: "احتفظ بالمنشورات المفيدة وتخلّص من الضوضاء وفق قواعدك الخاصة." },
        { title: "حسّن", copy: "أعد الصياغة ولخّص وترجم وأنشئ الوسوم باستخدام الذكاء الاصطناعي." },
        { title: "انشر", copy: "راجع مرة واحدة ثم أرسل إلى وجهة واحدة أو عدة وجهات في Telegram." },
      ],
    },
    inbox: {
      title: "صندوق المحتوى",
      status: "جاهز للمراجعة",
      matched: "12 نتيجة",
      now: "الآن",
      items: [
        { source: "@futuretech", title: "تحديث في بنية الذكاء الاصطناعي", action: "أخبار" },
        { source: "@digitalbrief", title: "إطلاق نموذج مفتوح المصدر", action: "ترجمة" },
        { source: "@industrywire", title: "تقرير منظومة Telegram", action: "ملخص" },
      ],
    },
    capabilities: {
      eyebrow: "غرفة التحكم التحريرية",
      title: "الأتمتة حيث تفيد. والحكم البشري حيث يهم.",
      body: "استخدم الذكاء الاصطناعي لتعمل أسرع من دون أن تفقد التحكم في أسلوبك. يبقى كل منشور قابلاً للتحرير والمراجعة قبل وصوله إلى جمهورك.",
      list: [
        "صندوق محتوى خاص لكل مستخدم",
        "دعم Gemini وOpenRouter",
        "مراجعة بشرية قبل النشر",
        "إرسال متوازٍ إلى عدة وجهات",
        "حملات للقنوات والمجموعات والمجموعات الفائقة",
        "صلاحيات فريق قائمة على الأدوار",
      ],
    },
    featureCards: {
      curation: {
        eyebrow: "تنسيق المحتوى",
        title: "أنشئ موجزاً مركزاً من القنوات التي تراقبها.",
        body: "اجمع المنشورات المطابقة، واحذف الترويج غير المرغوب فيه، وحسّن الصياغة، وانشر فقط ما يستحق الاهتمام.",
      },
      campaign: {
        eyebrow: "توزيع الحملات",
        title: "انقل رسالة واحدة معتمدة عبر شبكة Telegram الخاصة بك.",
        body: "نسّق الإرسال إلى القنوات والمجموعات والمجموعات الفائقة مع إبقاء نتيجة كل وجهة مستقلة.",
      },
    },
    security: {
      eyebrow: "خصوصية مدمجة في التصميم",
      title: "مساحة عملك تخصك وحدك.",
      body: "تُعزل المصادر والفلاتر ومنشورات الصندوق والوجهات والحملات وتفضيلات الذكاء الاصطناعي لكل مستخدم. تبقى بيانات الاعتماد الحساسة في الخادم وتحميها المصادقة والصلاحيات.",
    },
    cta: {
      eyebrow: "جاهز عندما تكون جاهزاً",
      title: "اجعل سير عمل Telegram منظماً ومقصوداً.",
      body: "افتح لوحة التحكم الخاصة بك لإعداد المصادر ومراجعة صندوق المحتوى والنشر بثقة.",
      button: "انتقل إلى لوحة التحكم",
    },
    footer: {
      workflow: "سير العمل",
      capabilities: "الإمكانات",
      security: "الأمان",
      dashboard: "لوحة التحكم",
    },
  },
  fa: {
    meta: {
      title: "TGReposter — پلتفرم هوشمند مدیریت محتوای تلگرام",
      description: "محتوای تلگرام را در یک فضای کاری خصوصی جمع‌آوری، فیلتر، بهینه، بازبینی و منتشر کنید.",
    },
    languageLabel: "زبان",
    a11y: {
      home: "صفحه اصلی TGReposter",
      openMenu: "باز کردن منو",
      closeMenu: "بستن منو",
      flowImageAlt: "نمای انتزاعی جریان محتوا از پردازش هوش مصنوعی تا مقصدهای تلگرام",
    },
    nav: {
      workflow: "نحوه کار",
      capabilities: "قابلیت‌ها",
      security: "امنیت",
      dashboard: "باز کردن داشبورد",
    },
    hero: {
      badge: "عملیات محتوای تلگرام با هوش مصنوعی",
      title: "شلوغی تلگرام را به سیگنال انتشار تبدیل کنید.",
      body: "کانال‌های مهم را پایش کنید، پست‌ها را با هوش مصنوعی بهبود دهید و محتوای تأییدشده را از یک فضای کاری خصوصی به همه مقصدهای تلگرام منتشر کنید.",
      primary: "فضای کاری را باز کنید",
      secondary: "مشاهده روند کار",
      proofApproval: "انتشار با تأیید انسانی",
      proofIsolation: "فضای کاری مستقل برای هر کاربر",
      stackLabel: "هماهنگ با زیرساخت شما",
    },
    workflow: {
      eyebrow: "یک روند پیوسته",
      title: "از کانال منبع تا پست منتشرشده.",
      body: "TGReposter جمع‌آوری، فیلتر، بهبود با هوش مصنوعی، بازبینی تحریریه و توزیع را در یک روند قابل‌ردیابی نگه می‌دارد و تصمیم نهایی انتشار را به انسان می‌سپارد.",
      steps: [
        { title: "جمع‌آوری", copy: "کانال‌های عمومی تلگرامی را که برای شما مهم هستند پایش کنید." },
        { title: "فیلتر", copy: "پست‌های مفید را نگه دارید و نویز را با قوانین خود حذف کنید." },
        { title: "بهبود", copy: "با هوش مصنوعی بازنویسی، خلاصه‌سازی، ترجمه و هشتگ‌سازی کنید." },
        { title: "انتشار", copy: "یک‌بار بازبینی کنید و سپس به یک یا چند مقصد تلگرام بفرستید." },
      ],
    },
    inbox: {
      title: "صندوق محتوا",
      status: "آماده بازبینی",
      matched: "۱۲ مورد منطبق",
      now: "اکنون",
      items: [
        { source: "@futuretech", title: "به‌روزرسانی زیرساخت هوش مصنوعی", action: "خبر" },
        { source: "@digitalbrief", title: "انتشار مدل متن‌باز", action: "ترجمه" },
        { source: "@industrywire", title: "گزارش اکوسیستم تلگرام", action: "خلاصه" },
      ],
    },
    capabilities: {
      eyebrow: "اتاق کنترل تحریریه",
      title: "اتوماسیون جایی که کمک می‌کند؛ قضاوت انسانی جایی که اهمیت دارد.",
      body: "از هوش مصنوعی برای افزایش سرعت استفاده کنید، بدون اینکه کنترل لحن و پیام خود را از دست بدهید. هر پست پیش از انتشار قابل ویرایش و بازبینی می‌ماند.",
      list: [
        "صندوق محتوای خصوصی برای هر کاربر",
        "پشتیبانی از Gemini و OpenRouter",
        "بازبینی انسانی پیش از انتشار",
        "ارسال هم‌زمان به چند مقصد",
        "کمپین برای کانال، گروه و سوپرگروه",
        "دسترسی تیمی مبتنی بر نقش",
      ],
    },
    featureCards: {
      curation: {
        eyebrow: "کیوریشن محتوا",
        title: "از کانال‌های تحت پایش، یک فید متمرکز بسازید.",
        body: "پست‌های منطبق را جمع‌آوری کنید، تبلیغات ناخواسته را حذف کنید، متن را بهبود دهید و فقط محتوای ارزشمند را منتشر کنید.",
      },
      campaign: {
        eyebrow: "توزیع کمپین",
        title: "یک پیام تأییدشده را در شبکه تلگرامی خود منتشر کنید.",
        body: "ارسال به کانال‌ها، گروه‌ها و سوپرگروه‌ها را هماهنگ کنید و نتیجه هر مقصد را مستقل نگه دارید.",
      },
    },
    security: {
      eyebrow: "حریم خصوصی در طراحی",
      title: "فضای کاری شما فقط متعلق به شماست.",
      body: "منابع، فیلترها، پست‌های صندوق محتوا، مقصدها، کمپین‌ها و ترجیحات هوش مصنوعی برای هر کاربر جدا هستند. اطلاعات حساس در بک‌اند باقی می‌مانند و با احراز هویت و دسترسی مبتنی بر نقش محافظت می‌شوند.",
    },
    cta: {
      eyebrow: "هر زمان آماده‌اید",
      title: "روند کار تلگرام را هدفمند و کنترل‌شده کنید.",
      body: "داشبورد خصوصی خود را باز کنید، منابع را تنظیم کنید، صندوق محتوا را بازبینی کنید و با اطمینان منتشر کنید.",
      button: "رفتن به داشبورد",
    },
    footer: {
      workflow: "روند کار",
      capabilities: "قابلیت‌ها",
      security: "امنیت",
      dashboard: "داشبورد",
    },
  },
};

const localeStorageKey = "tgreposter-locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en" || value === "ru" || value === "ar" || value === "fa";
}

export function getInitialMarketingLocale(): AppLocale {
  if (typeof window === "undefined") return "en";

  const stored = window.localStorage.getItem(localeStorageKey);
  if (isAppLocale(stored)) return stored;

  const browserLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const browserLocale of browserLocales) {
    const base = browserLocale.toLowerCase().split("-")[0];
    if (isAppLocale(base)) return base;
  }

  return "en";
}

export function persistMarketingLocale(locale: AppLocale) {
  window.localStorage.setItem(localeStorageKey, locale);
}
