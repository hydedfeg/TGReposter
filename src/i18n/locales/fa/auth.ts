const auth = {
  title: {
    signIn: "ورود به TGReposter",
    setup: "ساخت حساب مالک",
  },
  description: {
    signIn: "برای ورود به TGReposter از نام کاربری قدیمی یا ایمیل Supabase Auth استفاده کنید.",
    setup: "اولین حساب مدیر ارشد را برای ایمن‌سازی فضای کاری و تعیین مالکیت ایجاد کنید.",
  },
  success: {
    title: "حساب ساخته شد",
    description: "حساب مدیر ارشد آماده است. در حال باز کردن داشبورد…",
  },
  fields: {
    usernameOrEmail: "نام کاربری یا ایمیل",
    superAdminUsername: "نام کاربری مدیر ارشد",
    password: "رمز عبور",
    confirmPassword: "تأیید رمز عبور",
  },
  placeholders: {
    usernameOrEmail: "نام کاربری قدیمی یا ایمیل Supabase را وارد کنید",
    ownerUsername: "مثلاً owner",
  },
  passwordHelp: "حداقل از ۴ نویسه استفاده کنید. این حساب تنظیمات فضای کاری و انتشار را کنترل می‌کند.",
  actions: {
    signIn: "ورود",
    signingIn: "در حال ورود…",
    createOwner: "ساخت حساب مالک",
    creatingOwner: "در حال ساخت حساب…",
    showPassword: "نمایش رمز عبور",
    hidePassword: "پنهان کردن رمز عبور",
  },
  alert: {
    title: "مشکل در ورود",
  },
  validation: {
    identityRequired: "نام کاربری یا ایمیل نمی‌تواند خالی باشد.",
    passwordRequired: "رمز عبور نمی‌تواند خالی باشد.",
    usernameTooShort: "نام کاربری باید حداقل ۳ نویسه باشد.",
    passwordTooShort: "رمز عبور باید حداقل ۴ نویسه باشد.",
    passwordsMismatch: "رمزهای عبور یکسان نیستند.",
  },
  errors: {
    authenticationFailed: "ورود ناموفق بود. اطلاعات ورود را بررسی کنید.",
    network: "یک خطای غیرمنتظره شبکه یا سرور رخ داد.",
    alreadyConfigured: "حساب مدیریت قبلاً تنظیم شده است.",
    noAccountsConfigured: "هیچ حسابی تنظیم نشده است. ابتدا اطلاعات مالک را ایجاد کنید.",
    credentialsRequired: "نام کاربری/ایمیل و رمز عبور الزامی است.",
    invalidCredentials: "نام کاربری/ایمیل یا رمز عبور نادرست است.",
    invalidEmailPassword: "ایمیل یا رمز عبور نادرست است.",
    invalidLoginCredentials: "اطلاعات ورود نادرست است.",
    emailNotConfirmed: "ایمیل شما هنوز تأیید نشده است.",
    rateLimited: "تعداد تلاش‌های ورود بیش از حد است. کمی بعد دوباره تلاش کنید.",
  },
  footer: "نشست‌های Supabase Auth در سمت سرور با جدول پروفایل‌های RBAC اعتبارسنجی می‌شوند؛ نام‌های کاربری قدیمی نیز در دوره مهاجرت همچنان قابل استفاده‌اند.",
} as const;

export default auth;
