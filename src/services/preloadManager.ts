import type { Episode } from '../types/drama';

const warmedKeys = new Set<string>();
const activeControllers = new Map<string, AbortController>();

function makeKey(dramaId: string, episodeNumber: number): string {
  return `${dramaId}::ep-${episodeNumber}`;
}

export function isEpisodeWarmed(dramaId: string, episodeNumber: number): boolean {
  return warmedKeys.has(makeKey(dramaId, episodeNumber));
}

function prefetchImage(url?: string): void {
  if (!url) return;
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = url;
}

/**
 * Quietly warms the next episode's poster frame and initial stream manifest/bytes
 * once the current episode crosses 60% progress, avoiding bandwidth contention.
 */
export function preloadNextEpisode(dramaId: string, nextEpisode: Episode | undefined): void {
  if (!nextEpisode) return;

  const key = makeKey(dramaId, nextEpisode.number);
  if (warmedKeys.has(key) || activeControllers.has(key)) return;

  // 1. Always pre-decode the poster and first storyboard frame to prevent black flash
  prefetchImage(nextEpisode.posterUrl);
  if (nextEpisode.storyboardImages?.[0]) {
    prefetchImage(nextEpisode.storyboardImages[0]);
  }

  // 2. If a real HLS manifest exists, warm the m3u8 playlist & first media segment
  if (nextEpisode.hlsUrl) {
    const controller = new AbortController();
    activeControllers.set(key, controller);

    fetch(nextEpisode.hlsUrl, {
      method: 'GET',
      cache: 'force-cache',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const manifestText = await res.text();
        // Locate first segment or variant playlist URI inside m3u8 to warm edge cache
        const firstUriLine = manifestText
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.length > 0 && !line.startsWith('#'));

        if (firstUriLine) {
          const resolvedSegmentUrl = new URL(firstUriLine, nextEpisode.hlsUrl).toString();
          await fetch(resolvedSegmentUrl, {
            method: 'GET',
            cache: 'force-cache',
            signal: controller.signal,
          }).catch(() => undefined);
        }
        warmedKeys.add(key);
      })
      .catch(() => {
        // Silent best-effort warmup; never interrupt active playback
      })
      .finally(() => {
        activeControllers.delete(key);
      });
    return;
  }

  // 3. If a direct MP4 URL exists, warm only the first 512KB (moov + initial keyframes) via Range request
  if (nextEpisode.videoUrl) {
    const controller = new AbortController();
    activeControllers.set(key, controller);

    fetch(nextEpisode.videoUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-524287' },
      cache: 'force-cache',
      signal: controller.signal,
    })
      .then((res) => {
        if (res.ok || res.status === 206) {
          warmedKeys.add(key);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        activeControllers.delete(key);
      });
    return;
  }

  // 4. Built-in demo storyboard mode: images already warmed
  warmedKeys.add(key);
}

export function cancelPendingPreloads(): void {
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
}
