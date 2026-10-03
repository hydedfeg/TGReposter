const auth = {
  title: {
    signIn: "Войти в TGReposter",
    setup: "Создать аккаунт владельца",
  },
  description: {
    signIn: "Используйте прежнее имя пользователя или email Supabase Auth для входа в TGReposter.",
    setup: "Создайте первый аккаунт суперадминистратора, чтобы защитить рабочее пространство и назначить владельца.",
  },
  success: {
    title: "Аккаунт создан",
    description: "Аккаунт суперадминистратора готов. Открываем панель управления…",
  },
  fields: {
    usernameOrEmail: "Имя пользователя или email",
    superAdminUsername: "Имя суперадминистратора",
    password: "Пароль",
    confirmPassword: "Подтвердите пароль",
  },
  placeholders: {
    usernameOrEmail: "Введите прежнее имя пользователя или email Supabase",
    ownerUsername: "например, owner",
  },
  passwordHelp: "Используйте не менее 4 символов. Этот аккаунт управляет настройками рабочего пространства и публикацией.",
  actions: {
    signIn: "Войти",
    signingIn: "Вход…",
    createOwner: "Создать аккаунт владельца",
    creatingOwner: "Создание аккаунта…",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
  },
  alert: {
    title: "Проблема со входом",
  },
  validation: {
    identityRequired: "Имя пользователя или email не могут быть пустыми.",
    passwordRequired: "Пароль не может быть пустым.",
    usernameTooShort: "Имя пользователя должно содержать не менее 3 символов.",
    passwordTooShort: "Пароль должен содержать не менее 4 символов.",
    passwordsMismatch: "Пароли не совпадают.",
  },
  errors: {
    authenticationFailed: "Не удалось войти. Проверьте учетные данные.",
    network: "Произошла непредвиденная ошибка сети или сервера.",
    alreadyConfigured: "Аккаунт администратора уже настроен.",
    noAccountsConfigured: "Аккаунты не настроены. Сначала создайте учетные данные владельца.",
    credentialsRequired: "Требуются имя пользователя/email и пароль.",
    invalidCredentials: "Неверное имя пользователя/email или пароль.",
    invalidEmailPassword: "Неверный email или пароль.",
    invalidLoginCredentials: "Неверные данные для входа.",
    emailNotConfirmed: "Ваш email еще не подтвержден.",
    rateLimited: "Слишком много попыток входа. Повторите попытку позже.",
  },
  footer: "Сессии Supabase Auth проверяются на сервере по таблице профилей RBAC; прежние имена пользователей остаются доступными на время миграции.",
} as const;

export default auth;
