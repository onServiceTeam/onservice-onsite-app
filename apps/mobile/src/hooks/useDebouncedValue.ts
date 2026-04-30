/**
 * Phase 14 Dispatch 11 — useDebouncedValue
 *
 * Debounces a fast-changing value (e.g. search input) so query refetches
 * fire on a stable input instead of on every keystroke. Used on services
 * search, address autocomplete, and provider browse screens.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
