export const API_ERROR_CODES = {
  auth: {
    alreadyConfigured: "AUTH_ALREADY_CONFIGURED",
    noAccountsConfigured: "AUTH_NO_ACCOUNTS_CONFIGURED",
    credentialsRequired: "AUTH_CREDENTIALS_REQUIRED",
    invalidCredentials: "AUTH_INVALID_CREDENTIALS",
    emailNotConfirmed: "AUTH_EMAIL_NOT_CONFIRMED",
    rateLimited: "AUTH_RATE_LIMITED",
    usernameTooShort: "AUTH_USERNAME_TOO_SHORT",
    passwordTooShort: "AUTH_PASSWORD_TOO_SHORT",
    failed: "AUTH_FAILED",
  },
  publishing: {
    postNotFound: "PUBLISH_POST_NOT_FOUND",
    postNotApproved: "POST_NOT_APPROVED",
    destinationsLoadFailed: "PUBLISH_DESTINATIONS_LOAD_FAILED",
    credentialLoadFailed: "PUBLISH_CREDENTIAL_LOAD_FAILED",
    botNotConfigured: "PUBLISH_BOT_NOT_CONFIGURED",
    targetIdsInvalid: "PUBLISH_TARGET_IDS_INVALID",
    targetIdInvalid: "PUBLISH_TARGET_ID_INVALID",
    noTargetsSelected: "PUBLISH_NO_TARGETS_SELECTED",
    unknownTargets: "PUBLISH_UNKNOWN_TARGETS",
    disabledTargets: "PUBLISH_DISABLED_TARGETS",
    noEnabledTargets: "PUBLISH_NO_ENABLED_TARGETS",
    inboxStateSaveFailed: "PUBLISH_INBOX_STATE_SAVE_FAILED",
  },
} as const;

type NestedValues<T> = T extends Record<string, infer V>
  ? V extends string
    ? V
    : NestedValues<V>
  : never;

export type ApiErrorCode = NestedValues<typeof API_ERROR_CODES>;
