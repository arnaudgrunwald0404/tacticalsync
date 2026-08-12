import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `instanceof Error` misses DOMException (e.g. AbortError from a timed-out
// navigator.locks request inside supabase-js) and plain PostgrestError-shaped
// objects that don't extend Error, silently swallowing the real message.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err) return err;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    (err as { message: string }).message
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}
