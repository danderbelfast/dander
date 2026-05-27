/**
 * errors.ts — pull a human-readable message out of an axios error using
 * Dander's standard `{ success: false, code, message, details }` envelope.
 */

import axios from 'axios';

interface ApiErrorBody {
  message?: string;
  details?: Array<{ msg?: string; path?: string }>;
}

export function extractApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.details?.length) {
      const first = body.details[0];
      if (first?.msg) return first.msg;
    }
    if (body?.message) return body.message;
    if (err.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
    if (!err.response)               return 'Network error. Check your connection.';
  }
  // Plain Errors thrown locally (e.g. "Missing session — please sign in
  // again.") carry their own user-facing message; surface it rather than
  // collapsing to the generic fallback.
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
