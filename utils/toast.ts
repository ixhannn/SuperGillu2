type ToastType = 'success' | 'info' | 'error' | 'bell' | 'heart';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toast: ToastMessage | null) => void;

class ToastService {
  private listener: ToastListener | null = null;
  private currentToast: ToastMessage | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  public subscribe(listener: ToastListener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  public show(message: string, type: ToastType = 'info', duration: number = 3000) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const toast: ToastMessage = {
      id: Math.random().toString(36).substring(7),
      message,
      type,
      duration,
    };

    this.currentToast = toast;
    if (this.listener) {
      this.listener(toast);
    }

    this.timeoutId = setTimeout(() => {
      this.hide();
    }, duration);
  }

  public hide() {
    this.currentToast = null;
    if (this.listener) {
      this.listener(null);
    }
  }
}

export const toast = new ToastService();
