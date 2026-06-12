import type { MetaApiError } from "../types/meta-api.js";
import { RateLimitError } from "./rate-limiter.js";

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

function isTransientNetworkError(error: Error): boolean {
  const errorCode = (error as { code?: string }).code;

  return (
    error.name === "FetchError" ||
    error.name === "AbortError" ||
    (errorCode ? RETRYABLE_NETWORK_ERROR_CODES.has(errorCode) : false)
  );
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) return undefined;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, retryAfterSeconds * 1000);
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (!Number.isNaN(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return undefined;
}

export class MetaApiErrorHandler {
  static isMetaApiError(error: any): error is MetaApiError {
    return error && error.error && typeof error.error.code === "number";
  }

  static async handleResponse(response: any): Promise<any> {
    const responseText = await response.text();
    const retryAfterMs = parseRetryAfterMs(
      response?.headers?.get?.("retry-after") ?? null
    );

    if (!response.ok) {
      let errorData: any;

      try {
        errorData = JSON.parse(responseText);
      } catch {
        if (response.status === 429) {
          throw new RateLimitError(
            `HTTP 429: ${responseText}`,
            retryAfterMs ?? 60000
          );
        }
        throw new MetaApiProcessingError(
          `HTTP ${response.status}: ${responseText}`,
          response.status
        );
      }

      if (this.isMetaApiError(errorData)) {
        throw this.createSpecificError(
          errorData,
          response.status,
          retryAfterMs
        );
      }

      if (response.status === 429) {
        throw new RateLimitError(
          `HTTP 429: ${responseText}`,
          retryAfterMs ?? 60000
        );
      }

      throw new MetaApiProcessingError(
        `HTTP ${response.status}: ${responseText}`,
        response.status
      );
    }

    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  private static createSpecificError(
    errorData: MetaApiError,
    _httpStatus: number,
    retryAfterMs?: number
  ): Error {
    const { error } = errorData;
    const { code, error_subcode, message, type } = error;

    // Rate limiting errors
    if (code === 17 && error_subcode === 2446079) {
      return new RateLimitError(message, retryAfterMs ?? 300000); // 5 minutes
    }
    if (code === 613 && error_subcode === 1487742) {
      return new RateLimitError(message, retryAfterMs ?? 60000); // 1 minute
    }
    if (
      code === 4 &&
      (error_subcode === 1504022 || error_subcode === 1504039)
    ) {
      return new RateLimitError(message, retryAfterMs ?? 300000); // 5 minutes
    }

    // Authentication errors
    if (code === 190) {
      return new MetaAuthError(message, code, error_subcode);
    }

    // Permission errors
    if (code === 200 || code === 10) {
      return new MetaPermissionError(message, code, error_subcode);
    }

    // Validation errors — include subcode and faulty field to pinpoint the broken field
    if (code === 100) {
      const subcodeStr = error_subcode ? ` [subcode: ${error_subcode}]` : "";
      const rawErrData = (errorData as any)?.error?.error_data;
      const faultyField = rawErrData?.blame_field_specs?.[0]?.[0]
        ?? rawErrData?.field
        ?? null;
      const faultyFieldStr = faultyField ? ` [field: ${faultyField}]` : "";
      return new MetaValidationError(
        `${message}${subcodeStr}${faultyFieldStr}`,
        code,
        error_subcode
      );
    }

    // Application request limit
    if (code === 4) {
      return new MetaApplicationLimitError(message, code, error_subcode);
    }

    // User request limit
    if (code === 17) {
      return new MetaUserLimitError(message, code, error_subcode);
    }

    // Generic Meta API error — include subcode and faulty field when available
    const subcodeStr = error_subcode ? ` [subcode: ${error_subcode}]` : "";
    const rawErrorData = (errorData as any)?.error?.error_data;
    const faultyField = rawErrorData?.blame_field_specs?.[0]?.[0]
      ?? rawErrorData?.field
      ?? null;
    const faultyFieldStr = faultyField ? ` [field: ${faultyField}]` : "";
    return new MetaApiProcessingError(
      `${message}${subcodeStr}${faultyFieldStr}`,
      undefined,
      code,
      error_subcode,
      type
    );
  }

  static shouldRetry(error: Error): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof MetaApplicationLimitError) return true;
    if (error instanceof MetaUserLimitError) return true;
    if (isTransientNetworkError(error)) return true;
    if (error instanceof MetaApiProcessingError) {
      // Retry on server errors
      if ((error.httpStatus || 0) >= 500) return true;
      return error.httpStatus === 429;
    }
    return false;
  }

  static getRetryDelay(error: Error, attempt: number): number {
    if (error instanceof RateLimitError) {
      return error.retryAfterMs;
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 60000); // Cap at 1 minute
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return baseDelay + jitter;
  }

  static getMaxRetries(error: Error): number {
    if (error instanceof RateLimitError) return 3;
    if (error instanceof MetaApplicationLimitError) return 2;
    if (error instanceof MetaUserLimitError) return 2;
    if (isTransientNetworkError(error)) return 3;
    if (
      error instanceof MetaApiProcessingError &&
      (error.httpStatus || 0) >= 500
    )
      return 3;
    if (error instanceof MetaApiProcessingError && error.httpStatus === 429)
      return 3;
    return 0; // No retry for other errors
  }
}

export class MetaApiProcessingError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly errorCode?: number,
    public readonly errorSubcode?: number,
    public readonly errorType?: string
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      httpStatus: this.httpStatus,
      errorCode: this.errorCode,
      errorSubcode: this.errorSubcode,
      errorType: this.errorType,
    };
  }
}

export class MetaAuthError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 401, errorCode, errorSubcode, "OAuthException");
    this.name = "MetaAuthError";
  }
}

export class MetaPermissionError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 403, errorCode, errorSubcode, "FacebookApiException");
    this.name = "MetaPermissionError";
  }
}

export class MetaValidationError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 400, errorCode, errorSubcode, "FacebookApiException");
    this.name = "MetaValidationError";
  }
}

export class MetaApplicationLimitError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(
      message,
      429,
      errorCode,
      errorSubcode,
      "ApplicationRequestLimitReached"
    );
    this.name = "MetaApplicationLimitError";
  }
}

export class MetaUserLimitError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 429, errorCode, errorSubcode, "UserRequestLimitReached");
    this.name = "MetaUserLimitError";
  }
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  context: string = "operation"
): Promise<T> {
  let lastError: Error | undefined;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!MetaApiErrorHandler.shouldRetry(lastError)) {
        throw lastError;
      }

      const maxRetriesForError = MetaApiErrorHandler.getMaxRetries(lastError);
      attempt++;
      if (attempt > maxRetriesForError) {
        lastError.message = `${context} failed after ${maxRetriesForError} retries: ${lastError.message}`;
        throw lastError;
      }

      const delay = MetaApiErrorHandler.getRetryDelay(lastError, attempt);
      console.warn(
        `${context} failed (attempt ${attempt}/${maxRetriesForError}), retrying in ${delay}ms: ${lastError.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
