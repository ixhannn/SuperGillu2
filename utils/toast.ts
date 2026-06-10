type ToastType = 'success' | 'info' | 'error' | 'bell' | 'heart';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
  /** Called once when the toast goes away without the action being pressed. */
  onExpire?: () => void;
}

export interface UndoToastOptions {
  actionLabel?: string;
  onUndo: () => void;
  /** Commit handler — runs when the undo window closes without the user undoing. */
  onExpire?: () => void;
  duration?: number;
  type?: ToastType;
}

type ToastListener = (toast: ToastMessage | null) => void;

class ToastService {
  private listener: ToastListener | null = null;
  private currentToast: ToastMessage | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentSettled = false;

  public subscribe(listener: ToastListener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  public show(message: string, type: ToastType = 'info', duration: number = 3000) {
    this.present({
      id: Math.random().toString(36).substring(7),
      message,
      type,
      duration,
    });
  }

  /**
   * Shows a toast with an undo button and a visible countdown.
   * `onExpire` fires exactly once when the window closes without undo —
   * including when another toast replaces this one early.
   */
  public showUndo(message: string, options: UndoToastOptions) {
    this.present({
      id: Math.random().toString(36).substring(7),
      message,
      type: options.type ?? 'info',
      duration: options.duration ?? 6000,
      action: { label: options.actionLabel ?? 'Undo', onAction: options.onUndo },
      onExpire: options.onExpire,
    });
  }

  /** Invoked by the toast UI when the user presses the action button. */
  public runAction() {
    const current = this.currentToast;
    if (!current?.action) return;
    this.currentSettled = true; // action taken — onExpire must not fire
    const handler = current.action.onAction;
    this.dismiss();
    handler();
  }

  public hide() {
    this.settle();
    this.dismiss();
  }

  private present(toast: ToastMessage) {
    this.settle(); // commit any pending undo toast before replacing it
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.currentToast = toast;
    this.currentSettled = false;
    if (this.listener) this.listener(toast);
    this.timeoutId = setTimeout(() => this.hide(), toast.duration ?? 3000);
  }

  private settle() {
    const current = this.currentToast;
    if (!current || this.currentSettled) return;
    this.currentSettled = true;
    if (current.onExpire) {
      try {
        current.onExpire();
      } catch {
        // a failing commit handler must not break the toast pipeline
      }
    }
  }

  private dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentToast = null;
    if (this.listener) this.listener(null);
  }
}

export const toast = new ToastService();
