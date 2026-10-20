// ============================================
// Token pictures for the map, by token id, as they finish loading.
//
// Loaded once per picture address and side by side: a token moving, or two
// tokens sharing a picture, asks for nothing more. A picture that fails is
// remembered, so it is not asked for again on every change to the tokens;
// those tokens keep their placeholder until the page reloads. Each address
// keeps its own result, so a slow load can never put back a picture a token
// no longer shows.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Token } from '@/types';

type Loaded = { state: 'loading' } | { state: 'loaded'; image: HTMLImageElement } | { state: 'failed' };

export function useTokenImages(tokens: readonly Token[]): ReadonlyMap<string, HTMLImageElement> {
  const byAddress = useRef(new Map<string, Loaded>());
  // Bumped when a picture finishes, so the map below is worked out again.
  const [finished, setFinished] = useState(0);

  useEffect(() => {
    const cache = byAddress.current;
    const wanted = new Set(tokens.map((t) => t.imageUrl).filter((url): url is string => !!url));
    for (const url of wanted) {
      if (cache.has(url)) continue;
      cache.set(url, { state: 'loading' });
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cache.get(url)?.state !== 'loading') return;
        cache.set(url, { state: 'loaded', image: img });
        setFinished((n) => n + 1);
      };
      img.onerror = () => {
        if (cache.get(url)?.state !== 'loading') return;
        console.error('[MapCanvas] Token picture could not be loaded:', url);
        cache.set(url, { state: 'failed' });
      };
      img.src = url;
    }
    // Pictures no token shows any more are let go, so the cache stays the
    // size of the map; one still loading finishes into the cache first.
    for (const [url, entry] of cache) {
      if (!wanted.has(url) && entry.state !== 'loading') cache.delete(url);
    }
  }, [tokens]);

  return useMemo(() => {
    const images = new Map<string, HTMLImageElement>();
    for (const t of tokens) {
      const entry = t.imageUrl ? byAddress.current.get(t.imageUrl) : undefined;
      if (entry?.state === 'loaded') images.set(t.id, entry.image);
    }
    return images;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finished is bumped when a picture arrives; the pictures are in a ref
  }, [tokens, finished]);
}
