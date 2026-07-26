import { createStreamWatchdog } from '@/telemetry/sources/stream-watchdog';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('fires after the timeout once armed', () => {
  const onSilent = jest.fn();
  const watchdog = createStreamWatchdog(1000, onSilent);

  watchdog.arm();
  jest.advanceTimersByTime(999);
  expect(onSilent).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(onSilent).toHaveBeenCalledTimes(1);
});

it('re-arming resets the countdown', () => {
  const onSilent = jest.fn();
  const watchdog = createStreamWatchdog(1000, onSilent);

  watchdog.arm();
  jest.advanceTimersByTime(900);
  watchdog.arm();
  jest.advanceTimersByTime(900);
  expect(onSilent).not.toHaveBeenCalled();

  jest.advanceTimersByTime(100);
  expect(onSilent).toHaveBeenCalledTimes(1);
});

it('does not fire after disarm', () => {
  const onSilent = jest.fn();
  const watchdog = createStreamWatchdog(1000, onSilent);

  watchdog.arm();
  watchdog.disarm();
  jest.advanceTimersByTime(5000);
  expect(onSilent).not.toHaveBeenCalled();
});

it('fires only once per arm', () => {
  const onSilent = jest.fn();
  const watchdog = createStreamWatchdog(1000, onSilent);

  watchdog.arm();
  jest.advanceTimersByTime(5000);
  expect(onSilent).toHaveBeenCalledTimes(1);
});
