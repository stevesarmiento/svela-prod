interface ClerkErrorLike {
  errors?: Array<{
    code?: string;
    message?: string;
    longMessage?: string;
    long_message?: string;
  }>;
  message?: string;
  longMessage?: string;
  long_message?: string;
}

const ACCOUNT_NOT_FOUND_CODES = new Set([
  "form_identifier_not_found",
  "identifier_not_found",
  "web3_wallet_not_found",
  "web3_missing_identifier",
]);

const ACCOUNT_ALREADY_EXISTS_CODES = new Set([
  "form_identifier_exists",
  "identifier_exists",
  "web3_wallet_exists",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getErrorEntries(error: unknown): Array<{ code?: string; message?: string; longMessage?: string }> {
  const record = asObject(error) as ClerkErrorLike | null;
  if (!record) return [];

  const errors = Array.isArray(record.errors) ? record.errors : [];
  if (errors.length > 0) {
    return errors.map((entry) => ({
      code: entry.code,
      message: entry.message,
      longMessage: entry.longMessage ?? entry.long_message,
    }));
  }

  return [
    {
      message: record.message,
      longMessage: record.longMessage ?? record.long_message,
    },
  ];
}

function getNormalizedMessages(error: unknown): string[] {
  return getErrorEntries(error).flatMap((entry) =>
    [entry.longMessage, entry.message].flatMap((value) =>
      typeof value === "string" && value.trim().length > 0 ? [value.toLowerCase()] : [],
    ),
  );
}

function hasMatchingCode(error: unknown, codes: Set<string>): boolean {
  return getErrorEntries(error).some((entry) => typeof entry.code === "string" && codes.has(entry.code));
}

export function isAccountNotFoundError(error: unknown): boolean {
  if (hasMatchingCode(error, ACCOUNT_NOT_FOUND_CODES)) return true;

  return getNormalizedMessages(error).some(
    (message) =>
      message.includes("account not found") ||
      message.includes("identifier not found") ||
      message.includes("wallet not found") ||
      (message.includes("not found") && message.includes("wallet")),
  );
}

export function isAccountAlreadyExistsError(error: unknown): boolean {
  if (hasMatchingCode(error, ACCOUNT_ALREADY_EXISTS_CODES)) return true;

  return getNormalizedMessages(error).some(
    (message) =>
      message.includes("already exists") ||
      message.includes("already linked") ||
      (message.includes("already") && message.includes("wallet")),
  );
}

export function resolveClerkErrorMessage(error: unknown): string {
  if (isAccountNotFoundError(error)) {
    return "No account is linked to that wallet yet.";
  }

  if (isAccountAlreadyExistsError(error)) {
    return "That wallet is already linked to an account.";
  }

  const firstMessage = getErrorEntries(error)
    .flatMap((entry) => [entry.longMessage, entry.message])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!firstMessage) return "Authentication failed. Please try again.";
  return firstMessage.trim();
}
