const auth = {
  title: {
    signIn: "Sign in to TGReposter",
    setup: "Create the owner account",
  },
  description: {
    signIn: "Use your legacy username or Supabase Auth email to access TGReposter.",
    setup: "Create the first super-admin account to secure this workspace and establish ownership.",
  },
  success: {
    title: "Account created",
    description: "Your super-admin account is ready. Opening the dashboard…",
  },
  fields: {
    usernameOrEmail: "Username or Email",
    superAdminUsername: "Super-Admin Username",
    password: "Password",
    confirmPassword: "Confirm Password",
  },
  placeholders: {
    usernameOrEmail: "Enter legacy username or Supabase email",
    ownerUsername: "e.g. owner",
  },
  passwordHelp: "Use at least 4 characters. This account controls workspace configuration and publishing.",
  actions: {
    signIn: "Sign in",
    signingIn: "Signing in…",
    createOwner: "Create owner account",
    creatingOwner: "Creating account…",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  alert: {
    title: "Sign-in problem",
  },
  validation: {
    identityRequired: "Username or email cannot be empty.",
    passwordRequired: "Password cannot be empty.",
    usernameTooShort: "Username must be at least 3 characters.",
    passwordTooShort: "Password must be at least 4 characters long.",
    passwordsMismatch: "Passwords do not match.",
  },
  errors: {
    authenticationFailed: "Authentication failed. Please verify your credentials.",
    network: "An unexpected network or server error occurred.",
    alreadyConfigured: "The administration account has already been configured.",
    noAccountsConfigured: "No accounts are configured. Please set up owner credentials.",
    credentialsRequired: "Username/email and password are required.",
    invalidCredentials: "Invalid username/email or password.",
    invalidEmailPassword: "Invalid email or password.",
    invalidLoginCredentials: "Invalid login credentials.",
    emailNotConfirmed: "Your email address has not been confirmed yet.",
    rateLimited: "Too many sign-in attempts. Please try again later.",
  },
  footer: "Supabase Auth sessions are validated server-side against the profiles RBAC table; legacy usernames remain available during migration.",
} as const;

export default auth;
