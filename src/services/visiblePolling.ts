// A single request at a time, with no network polling in hidden tabs.
export function startVisiblePolling(
  task: (signal: AbortSignal) => Promise<void>, intervalMs: number,
  visibility: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined =
    typeof document === 'undefined' ? undefined : document
) {
  let stopped = false;
  let running = false;
  let resume = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const visible = () => visibility?.visibilityState !== 'hidden';
  const poll = async () => {
    if (stopped || !visible()) return;
    if (running) { resume = true; return; }
    running = true;
    resume = false;
    controller = new AbortController();
    try { await task(controller.signal); }
    finally {
      running = false;
      if (!stopped && visible()) timer = setTimeout(() => void poll(), resume ? 0 : intervalMs);
    }
  };
  const changed = () => {
    clearTimeout(timer);
    if (!visible()) { controller?.abort(); resume = false; }
    else void poll();
  };
  visibility?.addEventListener('visibilitychange', changed);
  void poll();
  return () => {
    stopped = true;
    controller?.abort();
    clearTimeout(timer);
    visibility?.removeEventListener('visibilitychange', changed);
  };
}
