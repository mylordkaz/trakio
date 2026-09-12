import * as fs from 'fs';
import * as path from 'path';
import i18n from '@/i18n';
import { useT } from '@/hooks/useT';

// i18n is mutable module state that React cannot see. A bare i18n.t(...) reached
// during render has no reactive input, so the React compiler may compute it once
// per component instance and the string survives a language change unchanged.
// useT threads the locale through the call, making it a real argument.
//
// Storing an already-translated string in state has the same problem, and the
// fix of making the producing effect depend on the translator is worse: it
// re-runs data loads, and on the recording screen it would tear down an active
// session. State holds keys or semantic values; translation happens at render.

const ROOT = path.resolve(__dirname, '..', '..');
// utils and services are included: the first version of this guard scanned only
// .tsx under app and components, and missed render-time translation living in
// formatters.
const SEARCH_DIRS = ['app', 'components', 'utils', 'services', 'hooks', 'contexts'];

function walk(dir: string): string[] {
  const out: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function sourcesOutside(allowed: Set<string>) {
  return SEARCH_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
    .map((file) => [path.relative(ROOT, file), fs.readFileSync(file, 'utf8')] as const)
    .filter(([relative]) => !allowed.has(relative));
}


// `t(` but not `format(`, `setTimeout(` and friends.
const TRANSLATES = /(?<![\w.])t\(/;

/** Every useEffect / useFocusEffect call, with its full body. */
function effects(source: string) {
  const found: { kind: string; body: string; line: number }[] = [];
  const opener = /\buse(Effect|FocusEffect)\(/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;

    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    found.push({
      kind: `use${match[1]}`,
      body: source.slice(match.index, end + 1),
      line: source.slice(0, match.index).split('\n').length,
    });
    opener.lastIndex = end + 1;
  }

  return found;
}

/**
 * Whether a hook body lists the translator as a dependency. Matched on the
 * callback's closing brace so that a nested form — useFocusEffect wrapping a
 * useCallback — is still seen; anchoring at the end of the body misses it.
 */
function dependsOnTranslator(body: string) {
  const deps = /\}\s*,\s*\[([^[\]]*)\]\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = deps.exec(body)) !== null) {
    if (match[1].split(',').some((dep) => dep.trim() === 't')) return true;
  }

  return false;
}

describe('useT', () => {
  it('translates in the locale it was given, not the global one', () => {
    const previous = i18n.locale;
    i18n.locale = 'en';

    try {
      // Exercise the hook's body directly: the global locale stays English
      // while the hook is handed Japanese, so a translator that ignored its
      // locale would return the English string here.
      let captured: ((key: string, options?: Record<string, unknown>) => string) | null = null;
      const useCallbackSpy = <T,>(fn: T) => fn;

      jest.isolateModules(() => {
        jest.doMock('react', () => ({
          ...jest.requireActual('react'),
          useCallback: useCallbackSpy,
        }));
        jest.doMock('@/contexts/MenuContext', () => ({ useMenu: () => ({ locale: 'ja' }) }));
        captured = require('@/hooks/useT').useT();
      });

      expect(captured).not.toBeNull();
      expect(captured!('circuits.length')).toBe('全長');
      expect(i18n.locale).toBe('en');
    } finally {
      i18n.locale = previous;
      jest.dontMock('react');
      jest.dontMock('@/contexts/MenuContext');
    }
  });

  it('is exported and callable', () => {
    expect(typeof useT).toBe('function');
  });
});

// A guard that cannot fail is not a guard. These fixtures are the patterns the
// rules exist to reject, and the shapes they must keep allowing.
describe('the guards themselves', () => {
  const storesTranslatedText = `
    useEffect(() => {
      const item = { value: t('common.tbd') };
      setItems([item]);
    }, [t]);
  `;
  const oldChecklistShape = `
    useEffect(() => {
      let gpsItem = { key: 'gpsLock', value: t('telemetry.searching'), status: 'warning' };
      setChecklistItems([gpsItem]);
    }, [db, selectedCircuit, t]);
  `;
  const focusEffectClearingState = `
    useFocusEffect(
      useCallback(() => {
        setLoadError(t('sessions.unableToLoadSession'));
        return () => setFilter(null);
      }, [db, t])
    );
  `;
  const allowedHandler = `
    const onDelete = useCallback(() => {
      Alert.alert(t('sessions.deleteTitle'));
    }, [t]);
  `;
  const allowedMemo = `
    const options = useMemo(() => codes.map((c) => countryName(c, t)), [codes, t]);
  `;

  const translatesInEffect = (src: string) =>
    effects(src).some(({ body }) => TRANSLATES.test(body));
  const dependsOnT = (src: string) =>
    effects(src).some(({ body }) => dependsOnTranslator(body));

  it('rejects translating inside an effect, however the value is assembled', () => {
    expect(translatesInEffect(storesTranslatedText)).toBe(true);
    expect(translatesInEffect(oldChecklistShape)).toBe(true);
    expect(translatesInEffect(focusEffectClearingState)).toBe(true);
  });

  it('rejects the translator as an effect dependency', () => {
    expect(dependsOnT(storesTranslatedText)).toBe(true);
    expect(dependsOnT(oldChecklistShape)).toBe(true);
    // useFocusEffect wraps a useCallback; the dependency still belongs to it.
    expect(dependsOnT(focusEffectClearingState)).toBe(true);
  });

  it('allows a plain useCallback handler and a useMemo to depend on t', () => {
    expect(effects(allowedHandler)).toHaveLength(0);
    expect(effects(allowedMemo)).toHaveLength(0);
  });

  it('does not mistake other calls ending in t for a translation', () => {
    expect(TRANSLATES.test('setTimeout(() => {}, 0)')).toBe(false);
    expect(TRANSLATES.test('format(value)')).toBe(false);
    expect(TRANSLATES.test('const x = t("a")')).toBe(true);
  });
});

describe('no translation escapes React', () => {
  it('has no bare i18n.t call anywhere it could run during render', () => {
    // Only these run on invocation rather than during render: alerts raised
    // from handlers and effects, an on-demand export, and the wrapper itself.
    const allowed = new Set([
      'hooks/useT.ts',
      'hooks/useAppUpdatePrompt.ts',
      'hooks/useLeaderboardShare.ts',
      'hooks/useShareSession.ts',
      'services/timesheet-export.ts',
    ]);
    const offenders = sourcesOutside(allowed)
      .filter(([, source]) => /\bi18n\.t\(/.test(source))
      .map(([relative]) => relative);

    expect(offenders).toEqual([]);
  });

  it('reads i18n.locale directly only where it runs on invocation', () => {
    const allowed = new Set([
      'app/_layout.tsx',            // sets it
      'app/feedback.tsx',           // submit handler, sends locale as metadata
      'components/circuits/CircuitRequestModal.tsx', // submit handler, same
      'services/timesheet-export.ts',               // export invoked on demand
      'hooks/useAppUpdatePrompt.ts',                // sends locale with the check
      'hooks/useShareSession.ts',                   // share payload, on demand
      'contexts/MenuContext.tsx',
    ]);
    const offenders = sourcesOutside(allowed)
      .filter(([, source]) => /\bi18n\.locale\b/.test(source))
      .map(([relative]) => relative);

    expect(offenders).toEqual([]);
  });

  it('never translates inside an effect', () => {
    // Translating in an effect means the result is stored, and a stored string
    // does not follow a language change. Constructing it through a variable or
    // an object hides it from a pattern match, so the rule is structural: no
    // translation anywhere inside an effect body, however it is assembled.
    const offenders: string[] = [];

    for (const [relative, source] of sourcesOutside(new Set())) {
      for (const { kind, body, line } of effects(source)) {
        if (TRANSLATES.test(body)) {
          offenders.push(`${relative}:${line} (${kind})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never lists the translator as an effect dependency', () => {
    // An effect that depends on t re-runs every data load it performs when the
    // language changes. Ordinary useCallback handlers and useMemo may depend on
    // t: they translate on invocation or during render and have no side effect.
    const offenders: string[] = [];

    for (const [relative, source] of sourcesOutside(new Set())) {
      for (const { kind, body, line } of effects(source)) {
        if (dependsOnTranslator(body)) {
          offenders.push(`${relative}:${line} (${kind})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
