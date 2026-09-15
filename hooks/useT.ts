import { useCallback } from 'react';
import i18n from '@/i18n';
import { useMenu } from '@/contexts/MenuContext';

/**
 * Translate in a way React can see.
 *
 * `i18n` is mutable module state, invisible to React's props/state/context
 * model, so a bare `i18n.t(...)` in a render body has no reactive input. The
 * React compiler is therefore free to compute it once per component instance,
 * and the string survives a language change unchanged.
 *
 * Passing the locale into the call makes it a genuine argument rather than a
 * declared-but-unused dependency, so the memoized value really is keyed on the
 * language and no lint suppression is needed.
 *
 * Only needed for translations produced during render. Calls made from event
 * handlers, alerts, or services run at invocation time and already read the
 * current locale.
 */
export function useT() {
  const { locale } = useMenu();

  return useCallback(
    (key: string, options?: Record<string, unknown>) =>
      i18n.t(key, { ...options, locale }),
    [locale],
  );
}

export type TranslateFn = ReturnType<typeof useT>;
