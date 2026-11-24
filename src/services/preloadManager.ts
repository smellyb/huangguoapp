import type { Episode } from '../types/drama';
import { fetchEpisodePlayback } from './dramaApi';
import Media3Player, { isNativeMedia3Available } from '../plugins/media3Player';

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
 * Pre-fetches the first segment of an HLS stream (up to ~800KB)
 * to prime browser and edge cache for instant startup without black frames.
 */
async function warmHlsStream(
  hlsUrl: string,
  cdn?: { authKey?: string; authValue?: string; app?: string },
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {};
  if (cdn?.authKey && cdn.authValue) {
    headers[cdn.authKey] = cdn.authValue;
  }
  if (cdn?.app) {
    headers['x-cdn-app'] = cdn.app;
  }

  const res = await fetch(hlsUrl, {
    method: 'GET',
    cache: 'force-cache',
    signal,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (!res.ok) return;
  const manifestText = await res.text();

  // Handle master playlist (contains #EXT-X-STREAM-INF followed by variant playlist uri)
  const lines = manifestText.split('\n').map((l) => l.trim()).filter(Boolean);
  let targetPlaylistUrl = hlsUrl;

  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  if (isMaster) {
    const variantUri = lines.find((l) => !l.startsWith('#'));
    if (variantUri) {
      targetPlaylistUrl = new URL(variantUri, hlsUrl).toString();
      const variantRes = await fetch(targetPlaylistUrl, {
        method: 'GET',
        cache: 'force-cache',
        signal,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      }).catch(() => null);

      if (variantRes?.ok) {
        const variantText = await variantRes.text();
        const segUri = variantText
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#'));
        if (segUri) {
          const segUrl = new URL(segUri, targetPlaylistUrl).toString();
          await fetch(segUrl, {
            method: 'GET',
            headers: { ...headers, Range: 'bytes=0-819200' },
            cache: 'force-cache',
            signal,
          }).catch(() => null);
        }
      }
      return;
    }
  }

  // Standard media playlist: locate first segment URI
  const firstUriLine = lines.find((line) => !line.startsWith('#'));
  if (firstUriLine) {
    const resolvedSegmentUrl = new URL(firstUriLine, targetPlaylistUrl).toString();
    await fetch(resolvedSegmentUrl, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-819200' },
      cache: 'force-cache',
      signal,
    }).catch(() => null);
  }
}

/**
 * Quietly warms the next episode's poster, stream metadata, and initial media segment
 * once current playback crosses 40% progress or <= 20s remaining.
 */
export async function preloadNextEpisode(
  dramaId: string,
  nextEpisode: Episode | undefined,
  apiBaseUrl?: string
): Promise<void> {
  if (!nextEpisode) return;

  const key = makeKey(dramaId, nextEpisode.number);
  if (warmedKeys.has(key) || activeControllers.has(key)) return;

  const controller = new AbortController();
  activeControllers.set(key, controller);

  try {
    // 1. Pre-decode poster image
    prefetchImage(nextEpisode.posterUrl);
    if (nextEpisode.storyboardImages?.[0]) {
      prefetchImage(nextEpisode.storyboardImages[0]);
    }

    // 2. If stream URL not yet resolved and apiBaseUrl provided, resolve it first
    if (!nextEpisode.hlsUrl && !nextEpisode.videoUrl && apiBaseUrl) {
      try {
        const info = await fetchEpisodePlayback(apiBaseUrl, dramaId, nextEpisode.number);
        if (info?.streamUrl && !controller.signal.aborted) {
          nextEpisode.hlsUrl = info.streamUrl;
          if (info.cdn) nextEpisode.cdn = info.cdn;
        }
      } catch {
        // Ignore preload resolution errors
      }
    }

    if (controller.signal.aborted) return;

    // 3. Warm HLS stream playlist + first segment
    if (nextEpisode.hlsUrl) {
      if (isNativeMedia3Available()) {
        const headers: Record<string, string> = {};
        if (nextEpisode.cdn?.authKey && nextEpisode.cdn.authValue) {
          headers[nextEpisode.cdn.authKey] = nextEpisode.cdn.authValue;
        }
        if (nextEpisode.cdn?.app) {
          headers['x-cdn-app'] = nextEpisode.cdn.app;
        }
        Media3Player.preload({ streamUrl: nextEpisode.hlsUrl }).catch(() => null);
        Media3Player.prepareNext({
          streamUrl: nextEpisode.hlsUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }).catch(() => null);
      }
      await warmHlsStream(nextEpisode.hlsUrl, nextEpisode.cdn, controller.signal);
      warmedKeys.add(key);
      return;
    }

    // 4. Warm MP4 direct stream first 512KB
    if (nextEpisode.videoUrl) {
      if (isNativeMedia3Available()) {
        const headers: Record<string, string> = {};
        if (nextEpisode.cdn?.authKey && nextEpisode.cdn.authValue) {
          headers[nextEpisode.cdn.authKey] = nextEpisode.cdn.authValue;
        }
        if (nextEpisode.cdn?.app) {
          headers['x-cdn-app'] = nextEpisode.cdn.app;
        }
        Media3Player.preload({ streamUrl: nextEpisode.videoUrl }).catch(() => null);
        Media3Player.prepareNext({
          streamUrl: nextEpisode.videoUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }).catch(() => null);
      }
      await fetch(nextEpisode.videoUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-524287' },
        cache: 'force-cache',
        signal: controller.signal,
      }).catch(() => null);
      warmedKeys.add(key);
      return;
    }

    warmedKeys.add(key);
  } catch {
    // Silent best-effort warmup
  } finally {
    activeControllers.delete(key);
  }
}

export function cancelPendingPreloads(): void {
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
}

