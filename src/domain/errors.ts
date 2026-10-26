/**
 * خطاهای قطعی Domain.
 * فقط این خطاها حق توقف Posting را دارند؛ یافته‌های ایجنت‌ها هرگز به این نوع تبدیل نمی‌شوند.
 */
export type DomainErrorCode =
  | "MINIMUM_LINES"
  | "UNBALANCED_ENTRY"
  | "GROUP_ACCOUNT_POSTING"
  | "NEGATIVE_AMOUNT"
  | "BOTH_SIDES_ON_LINE"
  | "ZERO_LINE"
  | "INVALID_DOCUMENT_STATUS"
  | "PERIOD_NOT_FOUND"
  | "PERIOD_CLOSED"
  | "PERIOD_COMPANY_MISMATCH"
  | "DATE_OUTSIDE_PERIOD"
  | "DISPLAY_ONLY_CURRENCY"
  | "FOREIGN_LINE_MISSING_RATE"
  | "UNKNOWN_ACCOUNT"
  | "INACTIVE_ACCOUNT"
  | "INVALID_AMOUNT_FORMAT"
  | "AMOUNT_PRECISION_EXCEEDED"
  | "UNKNOWN_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "INVALID_RATE"
  | "RATE_NOT_APPROVED"
  | "RATE_NOT_EFFECTIVE"
  | "RATE_TYPE_NOT_PERMITTED"
  | "RATE_DIRECTION_MISMATCH"
  | "INVALID_TRANSITION"
  | "PERMISSION_DENIED"
  | "SEGREGATION_OF_DUTIES"
  | "CONCURRENCY_CONFLICT"
  | "POSTED_IMMUTABLE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "TENANT_SCOPE_VIOLATION"
  | "ALLOCATION_INVALID"
  | "ALREADY_REVERSED"
  | "REVERSAL_IN_PROGRESS"
  | "REVERSAL_MISMATCH"
  | "REVALUATION_INVALID";

export class DomainValidationError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
    this.details = details;
  }
}

export interface DomainViolation {
  code: DomainErrorCode;
  message: string;
  lineIndex?: number;
}

export function isDomainError(err: unknown): err is DomainValidationError {
  return err instanceof DomainValidationError;
}
