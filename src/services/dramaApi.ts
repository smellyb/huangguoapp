import { DEMO_DRAMAS, DEMO_TOPICS } from '../data/demoCatalog';
import type { ApiConfig, Drama, Episode, RankingType, Topic } from '../types/drama';

const REQUEST_TIMEOUT_MS = 8000;

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  if (!isValidHttpUrl(url)) {
    throw new Error('接口地址必须以 http:// 或 https:// 开头');
  }

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
      throw new Error('请求超时（超过 8 秒），请检查接口连通性或 CORS 设置');
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
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.list)) return record.list as T[];
  }
  return [];
}

function sanitizeSafeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('/') || isValidHttpUrl(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function normalizeEpisode(raw: Partial<Episode>, index: number, fallbackPoster: string): Episode {
  const number = typeof raw.number === 'number' && raw.number > 0 ? raw.number : index + 1;
  return {
    number,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `第 ${number} 集`,
    hook: typeof raw.hook === 'string' ? raw.hook : '',
    durationSeconds:
      typeof raw.durationSeconds === 'number' && raw.durationSeconds > 0
        ? raw.durationSeconds
        : 90,
    hlsUrl: sanitizeSafeUrl(raw.hlsUrl),
    videoUrl: sanitizeSafeUrl(raw.videoUrl),
    posterUrl: sanitizeSafeUrl(raw.posterUrl) ?? fallbackPoster,
    qualities: Array.isArray(raw.qualities) ? raw.qualities : undefined,
    storyboardImages: Array.isArray(raw.storyboardImages)
      ? raw.storyboardImages
          .map((u) => sanitizeSafeUrl(u))
          .filter((u): u is string => Boolean(u))
      : undefined,
    subtitles: Array.isArray(raw.subtitles) ? raw.subtitles : [],
  };
}

function normalizeDrama(raw: Partial<Drama>, index: number): Drama {
  const fallback = DEMO_DRAMAS[index % DEMO_DRAMAS.length];
  const posterUrl = sanitizeSafeUrl(raw.posterUrl) ?? fallback.posterUrl;
  const rawEpisodes = Array.isArray(raw.episodes) ? raw.episodes : [];
  const totalEpisodes =
    typeof raw.totalEpisodes === 'number' && raw.totalEpisodes > 0
      ? raw.totalEpisodes
      : Math.max(rawEpisodes.length, 1);

  const episodes: Episode[] =
    rawEpisodes.length > 0
      ? rawEpisodes.map((ep, idx) => normalizeEpisode(ep, idx, posterUrl))
      : Array.from({ length: totalEpisodes }, (_, idx) =>
          normalizeEpisode({ number: idx + 1 }, idx, posterUrl)
        );

  const validCategories = ['AI短剧', '原创短剧', 'AI漫剧'] as const;
  const category = validCategories.includes(raw.category as (typeof validCategories)[number])
    ? (raw.category as Drama['category'])
    : 'AI短剧';

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `custom-drama-${index + 1}`,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `未命名短剧 ${index + 1}`,
    tagline: typeof raw.tagline === 'string' ? raw.tagline : '精选短剧内容',
    category,
    genres: Array.isArray(raw.genres) && raw.genres.length > 0 ? raw.genres : ['都市'],
    posterUrl,
    heroUrl: sanitizeSafeUrl(raw.heroUrl) ?? posterUrl,
    status: raw.status === '已完结' ? '已完结' : '连载中',
    totalEpisodes,
    updatedEpisodes:
      typeof raw.updatedEpisodes === 'number' && raw.updatedEpisodes > 0
        ? raw.updatedEpisodes
        : episodes.length,
    heatScore: typeof raw.heatScore === 'number' ? raw.heatScore : 8500 - index * 120,
    playCountLabel: typeof raw.playCountLabel === 'string' ? raw.playCountLabel : '热播中',
    likesBase: typeof raw.likesBase === 'number' ? raw.likesBase : 1200,
    releaseYear: typeof raw.releaseYear === 'string' ? raw.releaseYear : '2026',
    studio: typeof raw.studio === 'string' ? raw.studio : '自定义片源',
    synopsis: typeof raw.synopsis === 'string' ? raw.synopsis : '通过自定义 API 接入的短剧剧目。',
    topicIds: Array.isArray(raw.topicIds) ? raw.topicIds : [],
    isFeatured: Boolean(raw.isFeatured ?? index === 0),
    isNew: Boolean(raw.isNew ?? index < 4),
    episodes,
  };
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
        : '';

  if (!activeBase) {
    return {
      dramas: DEMO_DRAMAS,
      topics: DEMO_TOPICS,
      source: 'demo',
    };
  }

  try {
    const dramasPayload = await fetchJsonWithTimeout<unknown>(`${activeBase}/dramas`);
    const rawDramas = unwrapArray<Partial<Drama>>(dramasPayload);

    if (rawDramas.length === 0) {
      return {
        dramas: DEMO_DRAMAS,
        topics: DEMO_TOPICS,
        source: 'demo',
        warning: '自定义接口返回剧集列表为空，已自动回退至内置演示库。',
      };
    }

    const dramas = rawDramas.map((item, idx) => normalizeDrama(item, idx));

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
          coverUrl: sanitizeSafeUrl(t.coverUrl) ?? dramas[idx % dramas.length].posterUrl,
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
  } catch (err) {
    const reason = err instanceof Error ? err.message : '无法连接至自定义片源接口';
    return {
      dramas: DEMO_DRAMAS,
      topics: DEMO_TOPICS,
      source: 'demo',
      warning: `自定义接口连接失败（${reason}），已平滑回退至内置演示库。`,
    };
  }
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
      message: '请输入以 http:// 或 https:// 开头的有效 API 地址。',
    };
  }

  const normalized = normalizeBaseUrl(baseUrl);
  const start = performance.now();

  try {
    const payload = await fetchJsonWithTimeout<unknown>(`${normalized}/dramas`);
    const list = unwrapArray<unknown>(payload);
    const latencyMs = Math.round(performance.now() - start);

    if (list.length === 0) {
      return {
        ok: false,
        message: `接口可访问（${latencyMs}ms），但 /dramas 未返回有效剧集数组。`,
        latencyMs,
      };
    }

    return {
      ok: true,
      message: `连接成功，读取到 ${list.length} 部剧集（响应 ${latencyMs}ms）。`,
      count: list.length,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '接口测试失败，请检查地址与 CORS 配置。',
    };
  }
}

export function deriveRankings(dramas: Drama[], type: RankingType): Drama[] {
  const copy = [...dramas];
  if (type === 'comic') {
    return copy
      .filter((d) => d.category === 'AI漫剧')
      .concat(copy.filter((d) => d.category !== 'AI漫剧'))
      .sort((a, b) => {
        const aComic = a.category === 'AI漫剧' ? 1 : 0;
        const bComic = b.category === 'AI漫剧' ? 1 : 0;
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
