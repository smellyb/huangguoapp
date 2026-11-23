import { DEMO_DRAMAS, DEMO_TOPICS } from '../data/demoCatalog';
import type { ApiConfig, CdnAuthConfig, Drama, DramaCategory, DramaGenre, Episode, RankingType, Topic } from '../types/drama';
import { resolveEncryptedPlayback } from './edgeApiCrypto';

const REQUEST_TIMEOUT_MS = 10000;
export const DEFAULT_IMAGE_CDN = 'https://pic.qnlycc.cn';

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim(), window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || rawUrl.startsWith('/');
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

export function normalizeImageUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim().replace(/\\/g, '/');
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('http://')) {
    // Automatically upgrade pic.qnlycc.cn HTTP to HTTPS to prevent mixed content blocking in HTTPS/mobile WebViews
    if (trimmed.includes('pic.qnlycc.cn')) {
      return trimmed.replace(/^http:\/\//, 'https://');
    }
    return trimmed;
  }
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${DEFAULT_IMAGE_CDN}${trimmed}`;
  }
  return `${DEFAULT_IMAGE_CDN}/${trimmed}`;
}

/**
 * Strips auth signatures (auth_key, sign, token, etc.) from CDN image URLs.
 * If a signature expires (e.g. auth_key timestamp elapsed), pic.qnlycc.cn may reject with 403.
 * Stripping the expired signature allows recovering the original static asset.
 */
export function cleanCoverUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const normalized = normalizeImageUrl(rawUrl);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    const signatureParams = ['auth_key', 'sign', 'token', 'wsSecret', 'wsTime', 't', '_t'];
    let changed = false;
    for (const p of signatureParams) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (!changed) return normalized;
    const result = url.toString();
    return result.endsWith('?') ? result.slice(0, -1) : result;
  } catch {
    return normalized
      .replace(/[?&](auth_key|sign|token|wsSecret|wsTime|t|_t)=[^&]+/g, '')
      .replace(/\?$/, '');
  }
}

/**
 * Returns a reliable bundled fallback poster from DEMO_DRAMAS by index or hash.
 */
export function getFallbackPoster(indexOrId?: number | string): string {
  if (typeof indexOrId === 'number') {
    return DEMO_DRAMAS[Math.abs(indexOrId) % DEMO_DRAMAS.length]?.posterUrl || DEMO_DRAMAS[0].posterUrl;
  }
  if (typeof indexOrId === 'string' && indexOrId) {
    let hash = 0;
    for (let i = 0; i < indexOrId.length; i++) {
      hash = (hash << 5) - hash + indexOrId.charCodeAt(i);
      hash |= 0;
    }
    return DEMO_DRAMAS[Math.abs(hash) % DEMO_DRAMAS.length]?.posterUrl || DEMO_DRAMAS[0].posterUrl;
  }
  return DEMO_DRAMAS[0].posterUrl;
}

/**
 * Pure SVG data URI fallback placeholder for offline / broken covers.
 */
export const COVER_PLACEHOLDER_DATA_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1D202A"/>
          <stop offset="50%" stop-color="#14161D"/>
          <stop offset="100%" stop-color="#0B0C10"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <g transform="translate(110, 150)" stroke="#F59E0B" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">
        <rect x="2" y="2" width="76" height="60" rx="6"/>
        <line x1="2" y1="20" x2="78" y2="20"/>
        <line x1="22" y1="2" x2="14" y2="20"/>
        <line x1="42" y1="2" x2="34" y2="20"/>
        <line x1="62" y1="2" x2="54" y2="20"/>
        <polygon points="34,32 50,42 34,52" fill="#F59E0B" opacity="0.9"/>
      </g>
      <text x="150" y="245" fill="#94A3B8" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="500">短剧封面</text>
    </svg>`
  );

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`服务端返回 HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时（超过 10 秒），请检查网络代理（如 127.0.0.1:7897）或 CORS 设置');
    }
    throw err instanceof Error ? err : new Error('网络请求失败');
  } finally {
    window.clearTimeout(timer);
  }
}

function unwrapArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (record.data && typeof record.data === 'object') {
      const dataRecord = record.data as Record<string, unknown>;
      if (Array.isArray(dataRecord.items)) return dataRecord.items as T[];
      if (Array.isArray(dataRecord.list)) return dataRecord.list as T[];
    }
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.list)) return record.list as T[];
  }
  return [];
}

export interface HuangguoVideoItem {
  id: number | string;
  title: string;
  desc?: string;
  description?: string;
  cover?: string;
  hot?: number;
  duration?: string | number;
  cate_id?: string | number;
  cate_name?: string;
  score?: number;
  tags?: string[];
  badge?: string;
  is_hot?: number;
  is_original?: number;
  episode_count?: number;
  total_episodes?: number;
  is_finished?: boolean;
  episodes?: Array<{
    ep_num: number;
    title: string;
    duration: number;
    status?: number;
  }>;
  author?: {
    name?: string;
    avatar?: string;
  };
  play_at?: string;
  created_at?: string;
  metrics?: {
    play?: number;
    like?: number;
    collect?: number;
    comment?: number;
  };
  like_count?: number;
  collect_count?: number;
  comment_count?: number;
}

export interface HuangguoTopicItem {
  id: number | string;
  title: string;
  slug?: string;
  cover?: string;
  intro?: string;
  video_count?: number;
}

function deriveCategory(item: HuangguoVideoItem): DramaCategory {
  const tagsStr = (item.tags || []).join(' ');
  const title = item.title || '';
  if (
    tagsStr.includes('魔改') ||
    item.cate_id === 27 ||
    item.cate_id === '27' ||
    item.cate_name === 'AI魔改' ||
    title.includes('魔改')
  ) {
    return 'AI魔改';
  }
  if (
    tagsStr.includes('换脸') ||
    item.cate_id === 26 ||
    item.cate_id === '26' ||
    item.cate_name === 'AI换脸' ||
    title.includes('换脸')
  ) {
    return 'AI换脸';
  }
  if (
    tagsStr.includes('漫剧') ||
    item.cate_id === 25 ||
    item.cate_id === '25' ||
    item.cate_name === '漫剧' ||
    title.includes('漫剧')
  ) {
    return '漫剧';
  }
  return '短剧';
}

function deriveGenres(item: HuangguoVideoItem): DramaGenre[] {
  const validGenres: DramaGenre[] = [
    '都市',
    '古风',
    '奇幻',
    '现代',
    '职场',
    '逆袭',
    '校园',
    '熟女',
    '系统',
    '仙侠',
    '后宫',
    '悬疑',
    '武侠',
    '科幻',
    '机甲',
    '国风',
  ];
  const tags = item.tags || [];
  const matched = tags.filter((t): t is DramaGenre => validGenres.includes(t as DramaGenre));
  if (matched.length > 0) return matched;
  if (tags.some((t) => t.includes('古') || t.includes('仙侠') || t.includes('武侠'))) return ['古风'];
  if (tags.some((t) => t.includes('悬疑') || t.includes('灵异') || t.includes('恐怖'))) return ['悬疑'];
  if (tags.some((t) => t.includes('科幻') || t.includes('机甲'))) return ['科幻'];
  if (tags.some((t) => t.includes('系统') || t.includes('脑洞') || t.includes('游戏'))) return ['系统'];
  if (tags.some((t) => t.includes('逆袭') || t.includes('打脸') || t.includes('战神'))) return ['逆袭'];
  if (tags.some((t) => t.includes('职场') || t.includes('商战'))) return ['职场'];
  if (tags.some((t) => t.includes('现代') || t.includes('都市'))) return ['都市'];
  return ['都市'];
}

export function transformHuangguoItemToDrama(item: HuangguoVideoItem, index: number): Drama {
  const posterUrl = normalizeImageUrl(item.cover) || DEMO_DRAMAS[index % DEMO_DRAMAS.length].posterUrl;
  const totalEpisodes =
    (typeof item.total_episodes === 'number' && item.total_episodes > 0 ? item.total_episodes : 0) ||
    (typeof item.episode_count === 'number' && item.episode_count > 0 ? item.episode_count : 0) ||
    (Array.isArray(item.episodes) && item.episodes.length > 0 ? item.episodes.length : 1);

  const durationSec = Math.floor(Number(item.duration) || 90);

  const episodes: Episode[] =
    Array.isArray(item.episodes) && item.episodes.length > 0
      ? item.episodes.map((ep) => ({
          number: ep.ep_num,
          title: ep.title || `第 ${ep.ep_num} 集`,
          hook: '',
          durationSeconds: Number(ep.duration) || durationSec,
          subtitles: [],
          posterUrl,
        }))
      : Array.from({ length: totalEpisodes }, (_, idx) => ({
          number: idx + 1,
          title: `第 ${idx + 1} 集`,
          hook: '',
          durationSeconds: durationSec,
          subtitles: [],
          posterUrl,
        }));

  const heat = item.hot ?? item.metrics?.play ?? (8500 - index * 100);
  const playCountLabel =
    heat >= 10000000
      ? `${(heat / 10000000).toFixed(1)}千万热度`
      : heat >= 10000
        ? `${(heat / 10000).toFixed(1)}万热度`
        : `${heat}热度`;

  const synopsis = item.desc || item.description || '黄果短剧优质精选内容。';
  const tagline = (item.tags && item.tags.length > 0) ? item.tags.slice(0, 3).join(' · ') : 'AI高能微短剧';

  return {
    id: String(item.id),
    title: item.title || `短剧 ${item.id}`,
    tagline,
    category: deriveCategory(item),
    genres: deriveGenres(item),
    posterUrl,
    heroUrl: posterUrl,
    status: item.is_finished ? '已完结' : '连载中',
    totalEpisodes,
    updatedEpisodes: item.episode_count || totalEpisodes,
    heatScore: heat,
    playCountLabel,
    likesBase: item.like_count ?? item.metrics?.like ?? 1500,
    releaseYear: item.play_at?.slice(0, 4) || item.created_at?.slice(0, 4) || '2026',
    studio: item.author?.name || (item.is_original ? '黄果原创' : '黄果短剧'),
    synopsis,
    topicIds: [],
    isFeatured: Boolean(item.is_hot || index === 0),
    isNew: Boolean(index < 6),
    episodes,
  };
}

export interface EpisodePlaybackInfo {
  streamUrl: string;
  hevcUrl?: string;
  previewUrl?: string;
  cdn?: CdnAuthConfig;
  timestamp?: number;
}

export async function fetchEpisodePlayback(
  baseUrl: string,
  dramaId: string,
  episodeNumber: number
): Promise<EpisodePlaybackInfo | undefined> {
  const base = normalizeBaseUrl(baseUrl);

  // 1. 优先尝试官方边缘加密通信协议 (dx150-edge-v1 ECDH P-256 + HKDF + AES-GCM)
  try {
    const encryptedResult = await resolveEncryptedPlayback(base, dramaId, episodeNumber);
    if (encryptedResult?.streamUrl) {
      return {
        streamUrl: encryptedResult.streamUrl,
        hevcUrl: encryptedResult.hevcUrl,
        previewUrl: encryptedResult.previewUrl,
        cdn: encryptedResult.cdn,
        timestamp: encryptedResult.timestamp,
      };
    }
  } catch (err) {
    console.warn(`[dramaApi] Encrypted edge playback resolution failed for drama ${dramaId} ep ${episodeNumber}:`, err);
  }

  // 2. 备用平坦/直接线路尝试 (针对未启用边缘加密的镜像或反向代理)
  const endpoint = `${base}/api/videos/${encodeURIComponent(dramaId)}/episodes/${episodeNumber}/playback`;
  const fallbackEndpoint = `${base}/api/videos/${encodeURIComponent(dramaId)}/playback`;
  const playGetEndpoint = `${base}/api/videos/${encodeURIComponent(dramaId)}/play?ep=${episodeNumber}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const payload = (await res.json()) as {
        data?: {
          streams?: {
            main?: string;
            hevc?: string;
            preview?: string;
          };
          cdn?: CdnAuthConfig;
          timestamp?: number;
        };
      };
      const stream = payload?.data?.streams?.main || payload?.data?.streams?.preview || payload?.data?.streams?.hevc;
      if (stream) {
        return {
          streamUrl: stream,
          hevcUrl: payload.data?.streams?.hevc,
          previewUrl: payload.data?.streams?.preview,
          cdn: payload.data?.cdn,
          timestamp: payload.data?.timestamp,
        };
      }
    }

    const fallbackRes = await fetch(fallbackEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (fallbackRes.ok) {
      const payload = (await fallbackRes.json()) as {
        data?: {
          streams?: {
            main?: string;
            hevc?: string;
            preview?: string;
          };
          cdn?: CdnAuthConfig;
          timestamp?: number;
        };
      };
      const stream = payload?.data?.streams?.main || payload?.data?.streams?.preview || payload?.data?.streams?.hevc;
      if (stream) {
        return {
          streamUrl: stream,
          hevcUrl: payload.data?.streams?.hevc,
          previewUrl: payload.data?.streams?.preview,
          cdn: payload.data?.cdn,
          timestamp: payload.data?.timestamp,
        };
      }
    }

    // 3. 尝试公开 GET /api/videos/:id/play?ep=:ep
    const playRes = await fetch(playGetEndpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (playRes.ok) {
      const playPayload = (await playRes.json()) as {
        status?: number;
        data?: {
          video_url?: string;
          video_url_hevc?: string;
        };
      };
      if (playPayload?.status === 1 && playPayload.data?.video_url) {
        return {
          streamUrl: playPayload.data.video_url,
          hevcUrl: playPayload.data.video_url_hevc,
        };
      }
    }
  } catch (err) {
    console.warn(`[dramaApi] Failed direct playback resolution for drama ${dramaId} ep ${episodeNumber}:`, err);
  }

  return undefined;
}

export async function fetchEpisodeStreamUrl(
  baseUrl: string,
  dramaId: string,
  episodeNumber: number
): Promise<string | undefined> {
  const info = await fetchEpisodePlayback(baseUrl, dramaId, episodeNumber);
  return info?.streamUrl;
}

export async function fetchDramaDetail(
  baseUrl: string,
  dramaId: string
): Promise<{ episodes: Episode[]; synopsis?: string; totalEpisodes?: number; posterUrl?: string } | undefined> {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}/api/videos/${encodeURIComponent(dramaId)}`;
  try {
    const data = await fetchJsonWithTimeout<{
      data?: {
        cover?: string;
        description?: string;
        episode_count?: number;
        episodes?: Array<{
          ep_num: number;
          title: string;
          duration: number;
          status?: number;
        }>;
      };
    }>(url);

    if (data?.data?.episodes && data.data.episodes.length > 0) {
      const cover = normalizeImageUrl(data.data.cover);
      const episodes: Episode[] = data.data.episodes.map((ep) => ({
        number: ep.ep_num,
        title: ep.title || `第 ${ep.ep_num} 集`,
        hook: '',
        durationSeconds: Number(ep.duration) || 90,
        subtitles: [],
        posterUrl: cover || undefined,
      }));
      return {
        episodes,
        synopsis: data.data.description,
        totalEpisodes: data.data.episode_count || episodes.length,
        posterUrl: cover || undefined,
      };
    }
  } catch (err) {
    console.warn(`[dramaApi] Failed to fetch drama detail for ${dramaId}:`, err);
  }
  return undefined;
}

export async function searchRemoteDramas(baseUrl: string, query: string): Promise<Drama[]> {
  const q = query.trim();
  if (!q) return [];
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}/api/search?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchJsonWithTimeout<{
      data?: {
        items?: HuangguoVideoItem[];
      };
    }>(url);
    const items = res?.data?.items || [];
    return items.map((item, idx) => transformHuangguoItemToDrama(item, idx));
  } catch (err) {
    console.warn(`[dramaApi] Remote search failed:`, err);
    return [];
  }
}

export async function fetchHotSearchKeywords(baseUrl: string): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}/api/search/hot`;
  try {
    const res = await fetchJsonWithTimeout<{
      data?: {
        items?: Array<{ word: string }>;
      };
    }>(url);
    const items = res?.data?.items;
    if (Array.isArray(items) && items.length > 0) {
      return items.map((i) => i.word).filter(Boolean);
    }
  } catch {
    // fallback
  }
  return ['高三爱情故事', '神瞳觉醒', '少妇白洁', '时停手表', '锁情咒', 'AI漫剧', '琼明神女录'];
}

export interface CatalogResponse {
  dramas: Drama[];
  topics: Topic[];
  source: 'demo' | 'custom';
  warning?: string;
}

export async function loadDramaCatalog(config: ApiConfig): Promise<CatalogResponse> {
  const envBase = (import.meta.env.VITE_DRAMA_API_BASE_URL as string | undefined)?.trim() ?? '';
  const activeBase =
    config.mode === 'custom' && config.baseUrl.trim()
      ? normalizeBaseUrl(config.baseUrl)
      : config.mode === 'custom' && envBase
        ? normalizeBaseUrl(envBase)
        : envBase
          ? normalizeBaseUrl(envBase)
          : '';

  if (!activeBase) {
    return {
      dramas: DEMO_DRAMAS,
      topics: DEMO_TOPICS,
      source: 'demo',
    };
  }

  // 1. Try huangguoai API first (/api/videos?page=1&size=30)
  try {
    const huangguoUrl = `${activeBase}/api/videos?page=1&size=30`;
    const res = await fetchJsonWithTimeout<{
      data?: {
        items?: HuangguoVideoItem[];
        pagination?: { total: number };
      };
    }>(huangguoUrl);

    const items = res?.data?.items;
    if (Array.isArray(items) && items.length > 0) {
      const dramas = items.map((item, idx) => transformHuangguoItemToDrama(item, idx));

      // Fetch topics from /api/topics
      let topics: Topic[] = [];
      try {
        const topicsRes = await fetchJsonWithTimeout<{
          data?: {
            items?: HuangguoTopicItem[];
          };
        }>(`${activeBase}/api/topics`);
        const topicItems = topicsRes?.data?.items || [];
        topics = topicItems.map((t, idx) => ({
          id: String(t.id || t.slug || `topic-${idx + 1}`),
          title: t.title,
          subtitle: (t.intro || '').slice(0, 50) + ((t.intro || '').length > 50 ? '...' : ''),
          coverUrl: normalizeImageUrl(t.cover) || dramas[idx % dramas.length].posterUrl,
          dramaIds: dramas.slice(idx * 2, idx * 2 + 3).map((d) => d.id),
          accentNote: `共 ${t.video_count || 0} 部短剧`,
        }));
      } catch {
        topics = [
          {
            id: 'topic-hg-hot',
            title: '黄果热门短剧精选',
            subtitle: '高人气、高评分短剧与漫剧合辑',
            coverUrl: dramas[0].posterUrl,
            dramaIds: dramas.slice(0, 4).map((d) => d.id),
            accentNote: `共 ${dramas.length} 部剧集`,
          },
        ];
      }

      return {
        dramas,
        topics,
        source: 'custom',
      };
    }
  } catch {
    // If /api/videos failed, try standard /dramas endpoint next
  }

  // 2. Try generic standard /dramas endpoint
  try {
    const dramasPayload = await fetchJsonWithTimeout<unknown>(`${activeBase}/dramas`);
    const rawDramas = unwrapArray<Partial<Drama>>(dramasPayload);

    if (rawDramas.length > 0) {
      const dramas = rawDramas.map((item, idx) => {
        const fallback = DEMO_DRAMAS[idx % DEMO_DRAMAS.length];
        const posterUrl = item.posterUrl ? normalizeImageUrl(item.posterUrl) : fallback.posterUrl;
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `custom-drama-${idx + 1}`,
          title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `未命名短剧 ${idx + 1}`,
          tagline: typeof item.tagline === 'string' ? item.tagline : '精选短剧内容',
          category: (item.category as DramaCategory) || '短剧',
          genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : ['都市'],
          posterUrl,
          heroUrl: item.heroUrl ? normalizeImageUrl(item.heroUrl) : posterUrl,
          status: item.status === '已完结' ? '已完结' : '连载中',
          totalEpisodes: typeof item.totalEpisodes === 'number' && item.totalEpisodes > 0 ? item.totalEpisodes : 1,
          updatedEpisodes: typeof item.updatedEpisodes === 'number' && item.updatedEpisodes > 0 ? item.updatedEpisodes : 1,
          heatScore: typeof item.heatScore === 'number' ? item.heatScore : 8500 - idx * 120,
          playCountLabel: typeof item.playCountLabel === 'string' ? item.playCountLabel : '热播中',
          likesBase: typeof item.likesBase === 'number' ? item.likesBase : 1200,
          releaseYear: typeof item.releaseYear === 'string' ? item.releaseYear : '2026',
          studio: typeof item.studio === 'string' ? item.studio : '自定义片源',
          synopsis: typeof item.synopsis === 'string' ? item.synopsis : '自定义 API 接入的短剧剧目。',
          topicIds: Array.isArray(item.topicIds) ? item.topicIds : [],
          isFeatured: Boolean(item.isFeatured ?? idx === 0),
          isNew: Boolean(item.isNew ?? idx < 4),
          episodes: Array.isArray(item.episodes) ? item.episodes : [],
        } as Drama;
      });

      let topics: Topic[] = [];
      try {
        const topicsPayload = await fetchJsonWithTimeout<unknown>(`${activeBase}/topics`);
        const rawTopics = unwrapArray<Partial<Topic>>(topicsPayload);
        topics = rawTopics
          .filter((t) => typeof t.title === 'string' && t.title.trim())
          .map((t, idx) => ({
            id: typeof t.id === 'string' ? t.id : `topic-${idx + 1}`,
            title: t.title!.trim(),
            subtitle: typeof t.subtitle === 'string' ? t.subtitle : '',
            coverUrl: t.coverUrl ? normalizeImageUrl(t.coverUrl) : dramas[idx % dramas.length].posterUrl,
            dramaIds: Array.isArray(t.dramaIds) ? t.dramaIds : dramas.slice(0, 3).map((d) => d.id),
            accentNote: typeof t.accentNote === 'string' ? t.accentNote : '精选专题',
          }));
      } catch {
        topics = [
          {
            id: 'topic-custom-all',
            title: '自定义片源推荐合集',
            subtitle: '来自您配置的远程短剧片源接口',
            coverUrl: dramas[0].heroUrl ?? dramas[0].posterUrl,
            dramaIds: dramas.slice(0, 4).map((d) => d.id),
            accentNote: `共 ${dramas.length} 部剧集`,
          },
        ];
      }

      return {
        dramas,
        topics,
        source: 'custom',
      };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : '无法连接至短剧片源接口';
    return {
      dramas: DEMO_DRAMAS,
      topics: DEMO_TOPICS,
      source: 'demo',
      warning: `片源接口连接受阻（${reason}）。已平滑回退至内置演示库。请确保本地代理开启（如 127.0.0.1:7897）。`,
    };
  }

  return {
    dramas: DEMO_DRAMAS,
    topics: DEMO_TOPICS,
    source: 'demo',
    warning: '片源接口未返回剧集列表，已自动回退至内置演示库。',
  };
}

export async function testCustomApiEndpoint(baseUrl: string): Promise<{
  ok: boolean;
  message: string;
  count?: number;
  latencyMs?: number;
}> {
  if (!isValidHttpUrl(baseUrl)) {
    return {
      ok: false,
      message: '请输入以 http:// 或 https:// 开头的有效 API 地址，或本地代理路径如 /api-hg。',
    };
  }

  const normalized = normalizeBaseUrl(baseUrl);
  const start = performance.now();

  // Test huangguoai format first
  try {
    const hgPayload = await fetchJsonWithTimeout<{
      data?: {
        items?: HuangguoVideoItem[];
        pagination?: { total: number };
      };
    }>(`${normalized}/api/videos?page=1&size=5`);

    const latencyMs = Math.round(performance.now() - start);
    const items = hgPayload?.data?.items || [];
    const total = hgPayload?.data?.pagination?.total || items.length;

    if (items.length > 0) {
      return {
        ok: true,
        message: `成功连通黄果短剧 API（共收录 ${total} 部短剧，响应耗时 ${latencyMs}ms）。`,
        count: total,
        latencyMs,
      };
    }
  } catch {
    // try generic
  }

  // Test generic /dramas
  try {
    const payload = await fetchJsonWithTimeout<unknown>(`${normalized}/dramas`);
    const list = unwrapArray<unknown>(payload);
    const latencyMs = Math.round(performance.now() - start);

    if (list.length > 0) {
      return {
        ok: true,
        message: `连接成功，读取到 ${list.length} 部剧集（响应耗时 ${latencyMs}ms）。`,
        count: list.length,
        latencyMs,
      };
    }

    return {
      ok: false,
      message: `接口可访问（${latencyMs}ms），但未识别到短剧列表数据。`,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '接口测试失败，请检查网络代理与 CORS 设置。',
    };
  }
}

export function deriveRankings(dramas: Drama[], type: RankingType): Drama[] {
  const copy = [...dramas];
  if (type === 'comic') {
    return copy
      .filter((d) => d.category === '漫剧')
      .concat(copy.filter((d) => d.category !== '漫剧'))
      .sort((a, b) => {
        const aComic = a.category === '漫剧' ? 1 : 0;
        const bComic = b.category === '漫剧' ? 1 : 0;
        if (aComic !== bComic) return bComic - aComic;
        return b.heatScore - a.heatScore;
      });
  }

  if (type === 'new') {
    return copy.sort((a, b) => {
      const aNew = a.isNew ? 1 : 0;
      const bNew = b.isNew ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return b.updatedEpisodes - a.updatedEpisodes;
    });
  }

  return copy.sort((a, b) => b.heatScore - a.heatScore);
}

export function filterDramasByQuery(dramas: Drama[], rawQuery: string): Drama[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  return dramas.filter((drama) => {
    const haystack = [
      drama.title,
      drama.tagline,
      drama.category,
      drama.studio,
      drama.synopsis,
      ...drama.genres,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
