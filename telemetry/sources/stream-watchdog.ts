// A BLE link can stay connected while its data stream dies (wrong notify
// characteristic, device-side stall, silent subscription failure) — no
// disconnect event ever fires, so silence is the only observable signal.
export type StreamWatchdog = {
  // (Re)starts the silence countdown; call on connect and on every sample.
  arm: () => void;
  disarm: () => void;
};

export function createStreamWatchdog(
  timeoutMs: number,
  onSilent: () => void
): StreamWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function disarm(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function arm(): void {
    disarm();
    timer = setTimeout(() => {
      timer = null;
      onSilent();
    }, timeoutMs);
  }

  return { arm, disarm };
}
