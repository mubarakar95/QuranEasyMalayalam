export type ToastStatus = "loading" | "fallback" | "success" | "error";

export interface GeminiToastEvent {
  id: string;
  title: string;
  message: string;
  status: ToastStatus;
  model?: string;
  timestamp?: number;
}

type ToastListener = (toast: GeminiToastEvent | null) => void;
const listeners = new Set<ToastListener>();
let currentToast: GeminiToastEvent | null = null;
let dismissTimer: NodeJS.Timeout | null = null;

export function emitGeminiToast(toast: GeminiToastEvent | null, autoDismissMs?: number) {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  currentToast = toast;
  listeners.forEach((fn) => fn(toast));

  if (toast && (toast.status === "success" || toast.status === "error" || autoDismissMs)) {
    const delay = autoDismissMs ?? (toast.status === "success" ? 3500 : 5000);
    dismissTimer = setTimeout(() => {
      currentToast = null;
      listeners.forEach((fn) => fn(null));
      dismissTimer = null;
    }, delay);
  }
}

export function subscribeGeminiToast(listener: ToastListener): () => void {
  listeners.add(listener);
  // Send current toast to new subscriber
  listener(currentToast);
  return () => {
    listeners.delete(listener);
  };
}
