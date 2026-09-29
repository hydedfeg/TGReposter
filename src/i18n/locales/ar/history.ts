const history = {
  header: {
    title: "سجل النشر",
    description: "راجع المنشورات التي أُرسلت إلى تيليجرام وأي تحذيرات مسجلة بشأن التسليم.",
  },
  search: {
    label: "البحث في سجل النشر",
    placeholder: "البحث في المنشورات المنشورة أو القنوات",
  },
  empty: {
    title: "لا توجد منشورات منشورة بعد",
    description: "ستظهر المنشورات هنا بعد الموافقة عليها ونشرها بنجاح على تيليجرام.",
    search: "لا توجد منشورات منشورة مطابقة لهذا البحث. جرّب قناة أو عبارة أخرى.",
  },
  queue: {
    title: "المنشورات المنشورة",
    count_zero: "لا توجد منشورات منشورة",
    count_one: "منشور واحد منشور",
    count_two: "منشوران منشوران",
    count_few: "{{formattedCount}} منشورات منشورة",
    count_many: "{{formattedCount}} منشورًا منشورًا",
    count_other: "{{formattedCount}} منشور منشور",
  },
  details: {
    publishedVersion: "النسخة المنشورة",
    publishedAt: "نُشر {{date}}",
    deliveryStatus: "حالة التسليم",
    delivered: "تم النشر بنجاح",
    deliveredWithWarnings: "تم النشر مع تحذيرات بشأن التسليم",
    deliveryNote: "ملاحظة التسليم",
    noTimestamp: "وقت النشر غير متاح",
  },
  mobile: {
    title: "المنشور المنشور",
    modeLabel: "عرض السجل",
    modes: {
      original: "الأصل",
      edit: "المنشور",
      preview: "معاينة",
    },
  },
  accessibility: {
    historyList: "قائمة سجل النشر",
    publishedEditor: "تفاصيل المنشور المنشور",
  },
} as const;

export default history;
