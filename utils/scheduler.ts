type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type SchedulerApi = {
  yield?: () => Promise<void>;
};

type NavigatorWithScheduling = Navigator & {
  scheduling?: {
    isInputPending?: (options?: { includeContinuous?: boolean }) => boolean;
  };
};

export type CancelScheduledTask = () => void;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const getScheduler = (): SchedulerApi | undefined => (
  typeof globalThis !== 'undefined'
    ? (globalThis as typeof globalThis & { scheduler?: SchedulerApi }).scheduler
    : undefined
);

export const hasPendingUserInput = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const scheduling = (navigator as NavigatorWithScheduling).scheduling;
  try {
    return scheduling?.isInputPending?.({ includeContinuous: true }) === true;
  } catch {
    return false;
  }
};

export const afterNextPaint = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(resolve, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

export const yieldToMain = (): Promise<void> => new Promise((resolve) => {
  const scheduler = getScheduler();
  if (typeof scheduler?.yield === 'function') {
    void scheduler.yield().then(resolve, resolve);
    return;
  }

  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
    return;
  }

  setTimeout(resolve, 0);
});

export const scheduleIdleTask = (
  task: () => void | Promise<void>,
  options: { timeout?: number; delay?: number } = {},
): CancelScheduledTask => {
  if (typeof window === 'undefined') return () => {};

  const win = window as IdleWindow;
  let cancelled = false;
  let idleId: number | null = null;
  let timerId: number | null = null;

  const run = () => {
    if (cancelled) return;
    void task();
  };

  const scheduleIdle = () => {
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(run, { timeout: options.timeout ?? 2000 });
      return;
    }
    timerId = window.setTimeout(run, options.timeout ?? 0);
  };

  if (options.delay && options.delay > 0) {
    timerId = window.setTimeout(scheduleIdle, options.delay);
  } else {
    scheduleIdle();
  }

  return () => {
    cancelled = true;
    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
    }
    if (timerId !== null) window.clearTimeout(timerId);
  };
};

export const runFrameBudgeted = async <T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void> | void,
  options: { budgetMs?: number; yieldEvery?: number } = {},
): Promise<void> => {
  const budgetMs = options.budgetMs ?? 8;
  const yieldEvery = options.yieldEvery ?? 1;
  let frameStartedAt = now();

  for (let index = 0; index < items.length; index += 1) {
    await worker(items[index], index);

    const spent = now() - frameStartedAt;
    const shouldYieldForBudget = spent >= budgetMs;
    const shouldYieldForCadence = yieldEvery > 0 && (index + 1) % yieldEvery === 0;
    const shouldYieldForInput = hasPendingUserInput();

    if (shouldYieldForInput || shouldYieldForBudget || shouldYieldForCadence) {
      await yieldToMain();
      frameStartedAt = now();
    }
  }
};
