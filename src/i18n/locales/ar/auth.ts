const auth = {
  title: {
    signIn: "تسجيل الدخول إلى TGReposter",
    setup: "إنشاء حساب المالك",
  },
  description: {
    signIn: "استخدم اسم المستخدم القديم أو بريد Supabase Auth الإلكتروني للوصول إلى TGReposter.",
    setup: "أنشئ أول حساب مشرف عام لتأمين مساحة العمل وتحديد ملكيتها.",
  },
  success: {
    title: "تم إنشاء الحساب",
    description: "حساب المشرف العام جاهز. جارٍ فتح لوحة التحكم…",
  },
  fields: {
    usernameOrEmail: "اسم المستخدم أو البريد الإلكتروني",
    superAdminUsername: "اسم مستخدم المشرف العام",
    password: "كلمة المرور",
    confirmPassword: "تأكيد كلمة المرور",
  },
  placeholders: {
    usernameOrEmail: "أدخل اسم المستخدم القديم أو بريد Supabase",
    ownerUsername: "مثال: owner",
  },
  passwordHelp: "استخدم 4 أحرف على الأقل. يتحكم هذا الحساب في إعدادات مساحة العمل والنشر.",
  actions: {
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    createOwner: "إنشاء حساب المالك",
    creatingOwner: "جارٍ إنشاء الحساب…",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
  },
  alert: {
    title: "مشكلة في تسجيل الدخول",
  },
  validation: {
    identityRequired: "لا يمكن ترك اسم المستخدم أو البريد الإلكتروني فارغًا.",
    passwordRequired: "لا يمكن ترك كلمة المرور فارغة.",
    usernameTooShort: "يجب أن يتكون اسم المستخدم من 3 أحرف على الأقل.",
    passwordTooShort: "يجب أن تتكون كلمة المرور من 4 أحرف على الأقل.",
    passwordsMismatch: "كلمتا المرور غير متطابقتين.",
  },
  errors: {
    authenticationFailed: "تعذر تسجيل الدخول. تحقق من بيانات الاعتماد.",
    network: "حدث خطأ غير متوقع في الشبكة أو الخادم.",
    alreadyConfigured: "تم إعداد حساب الإدارة بالفعل.",
    noAccountsConfigured: "لا توجد حسابات مُعدّة. أنشئ بيانات اعتماد المالك أولًا.",
    credentialsRequired: "اسم المستخدم/البريد الإلكتروني وكلمة المرور مطلوبان.",
    invalidCredentials: "اسم المستخدم/البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    invalidEmailPassword: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    invalidLoginCredentials: "بيانات تسجيل الدخول غير صحيحة.",
    emailNotConfirmed: "لم يتم تأكيد بريدك الإلكتروني بعد.",
    rateLimited: "عدد محاولات تسجيل الدخول كبير جدًا. حاول مرة أخرى لاحقًا.",
  },
  footer: "يتم التحقق من جلسات Supabase Auth على الخادم مقابل جدول ملفات تعريف RBAC، وتبقى أسماء المستخدمين القديمة متاحة أثناء الترحيل.",
} as const;

export default auth;
