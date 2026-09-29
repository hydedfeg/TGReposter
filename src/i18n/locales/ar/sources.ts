const sources = {
  header: {
    title: "قنوات المصدر",
    description: "اجمع الرسائل مباشرة من قنوات تيليجرام العامة. لا حاجة إلى بيانات اعتماد API.",
  },
  actions: {
    scrapeAll: "جمع البيانات من جميع القنوات",
    add: "إضافة قناة",
    scrapeOne: "جمع البيانات من هذه القناة",
    remove: "إزالة القناة",
  },
  form: {
    usernameLabel: "اسم مستخدم قناة تيليجرام",
    placeholder: "durov أو techcrunch",
  },
  validation: {
    usernameRequired: "لا يمكن ترك اسم المستخدم فارغًا.",
    duplicate: "القناة موجودة بالفعل.",
  },
  empty: {
    title: "لا توجد قنوات مصدر",
    description: "أضف اسم مستخدم قناة تيليجرام أعلاه لبدء جمع المحتوى.",
  },
  status: {
    fetching: "جارٍ جمع البيانات",
    scraped: "تم الجمع {{time}}",
    failed: "فشل",
  },
  accessibility: {
    channelList: "قنوات المصدر",
  },
} as const;

export default sources;
