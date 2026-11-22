/**
 * 黄果短剧 - 官方地址发布页服务与线路测速引擎
 * 数据同步自：https://huangguotv.github.io/
 */

export interface ServerLine {
  id: string;
  name: string;
  url: string;
  category: 'direct' | 'permanent' | 'custom';
  tag: string;
  tagClass: 'tag-fast' | 'tag-perm' | 'tag-backup' | 'tag-custom';
  baseMs?: number;
  latencyMs?: number;
  status: 'idle' | 'testing' | 'online' | 'error';
  isOfficial?: boolean;
  errorMessage?: string;
}

export interface OfficialChannel {
  type: 'tg' | 'x' | 'tk' | 'yt' | 'mail';
  title: string;
  handle: string;
  link: string;
}

export const PUBLISH_PAGE_URL = 'https://huangguotv.github.io/';
export const PUBLISH_PAGE_FALLBACK = 'https://huangguo88.pages.dev/';
export const OFFICIAL_SUPPORT_EMAIL = 'huangguoaiai@gmail.com';

// 官方默认国内直连线路（免代理 · 实时轮换节点）
export const DEFAULT_SPEED_LINES: ServerLine[] = [
  {
    id: 'speed-1',
    name: '国内直连线路 01 (极速免翻)',
    url: 'https://zv8c.zekpkeusp.cc',
    category: 'direct',
    tag: '推荐',
    tagClass: 'tag-fast',
    baseMs: 22,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'speed-2',
    name: '国内直连线路 02 (高速免代理)',
    url: 'https://bgskg.kplsifomz.cc',
    category: 'direct',
    tag: '极速',
    tagClass: 'tag-fast',
    baseMs: 28,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'speed-3',
    name: '国内直连线路 03 (电信/多线专线)',
    url: 'https://p8rkne.cqcbvbrwd.cc',
    category: 'direct',
    tag: '极速',
    tagClass: 'tag-fast',
    baseMs: 31,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'speed-4',
    name: '国内直连线路 04 (移动/联通加速)',
    url: 'https://sz83.cqcbvbrwd.cc',
    category: 'direct',
    tag: '流畅',
    tagClass: 'tag-fast',
    baseMs: 36,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'speed-5',
    name: '国内备用直连 05 (防封容灾线路)',
    url: 'https://3cf1.gieijzmcp.cc',
    category: 'direct',
    tag: '稳定',
    tagClass: 'tag-backup',
    baseMs: 42,
    status: 'idle',
    isOfficial: true,
  },
];

// 官方永久与主干入口
export const DEFAULT_PERMANENT_DOMAINS: ServerLine[] = [
  {
    id: 'perm-1',
    name: '官方网站 / 内容主站',
    url: 'https://huangguoai.com',
    category: 'permanent',
    tag: '主域',
    tagClass: 'tag-perm',
    baseMs: 32,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'perm-2',
    name: '最新地址 / 中转入口',
    url: 'https://huangguoai.ai',
    category: 'permanent',
    tag: '中转',
    tagClass: 'tag-fast',
    baseMs: 28,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'perm-3',
    name: '备用主干 / 官方入口',
    url: 'https://hgai28.com',
    category: 'permanent',
    tag: '备用',
    tagClass: 'tag-backup',
    baseMs: 45,
    status: 'idle',
    isOfficial: true,
  },
  {
    id: 'perm-4',
    name: '创作者与商务合作',
    url: 'https://huangguoai.me',
    category: 'permanent',
    tag: '合作',
    tagClass: 'tag-backup',
    baseMs: 51,
    status: 'idle',
    isOfficial: true,
  },
];

export const OFFICIAL_CHANNELS: OfficialChannel[] = [
  { type: 'mail', title: '官方发信索取最新地址', handle: OFFICIAL_SUPPORT_EMAIL, link: `mailto:${OFFICIAL_SUPPORT_EMAIL}?subject=索取黄果最新地址` },
  { type: 'tg', title: 'Telegram 官方频道', handle: 't.me/huangguofans', link: 'https://t.me/huangguofans' },
  { type: 'x', title: 'X (Twitter) 官方账号', handle: '@huangguoai', link: 'https://x.com/huangguoai' },
  { type: 'tk', title: 'TikTok 官方账号', handle: '@huangguoai', link: 'https://www.tiktok.com/@huangguoai' },
  { type: 'yt', title: 'YouTube 官方频道', handle: '@huangguoaiai', link: 'https://www.youtube.com/@huangguoaiai' },
];

const CUSTOM_LINES_STORAGE_KEY = 'huangguo_user_custom_lines_v1';
const SYNCED_LINES_STORAGE_KEY = 'huangguo_synced_publish_lines_v1';

export function getStoredCustomLines(): ServerLine[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_LINES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ServerLine[];
  } catch {
    return [];
  }
}

export function saveStoredCustomLines(lines: ServerLine[]): void {
  try {
    window.localStorage.setItem(CUSTOM_LINES_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // ignore
  }
}

export function getStoredSyncedLines(): { direct: ServerLine[]; permanent: ServerLine[] } | null {
  try {
    const raw = window.localStorage.getItem(SYNCED_LINES_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStoredSyncedLines(data: { direct: ServerLine[]; permanent: ServerLine[] }): void {
  try {
    window.localStorage.setItem(SYNCED_LINES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * 测速单条线路，使用 /api/videos 或轻量请求测量延迟
 */
export async function testLineLatency(
  rawUrl: string,
  timeoutMs = 4500
): Promise<{ ok: boolean; latency: number; error?: string }> {
  const cleanUrl = rawUrl.trim().replace(/\/+$/, '');
  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 优先通过短剧 API 检索测试有效连通性与 CORS
    const apiUrl = cleanUrl.startsWith('http')
      ? `${cleanUrl}/api/videos?page=1&size=1`
      : cleanUrl;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (response.ok) {
      return { ok: true, latency: Math.max(12, elapsed) };
    }

    // 若 API 路径 404/500，再尝试探测站点根目录
    const rootRes = await fetch(cleanUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    const rootElapsed = Math.round(performance.now() - startTime);
    if (rootRes.ok) {
      return { ok: true, latency: Math.max(15, rootElapsed) };
    }

    return {
      ok: false,
      latency: 0,
      error: `HTTP ${response.status}`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, latency: 0, error: '连接超时 (>4.5s)' };
    }
    return {
      ok: false,
      latency: 0,
      error: err instanceof Error ? err.message : '网络不通',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 提取发布页中 SPEED_LINES / PERMANENT_DOMAINS 数组
 */
function parsePublishScript(jsCode: string): {
  direct: ServerLine[];
  permanent: ServerLine[];
} | null {
  try {
    const direct: ServerLine[] = [];
    const permanent: ServerLine[] = [];

    // 正则提取 SPEED_LINES 对象
    const speedMatch = jsCode.match(/const\s+SPEED_LINES\s*=\s*(\[[\s\S]*?\]);/);
    if (speedMatch && speedMatch[1]) {
      // 简单安全转换为对象
      const items = Function(`"use strict"; return (${speedMatch[1]});`)();
      if (Array.isArray(items)) {
        items.forEach((item, idx) => {
          if (item && item.url) {
            direct.push({
              id: `speed-remote-${idx + 1}`,
              name: item.name || `国内直连线路 0${idx + 1}`,
              url: item.url,
              category: 'direct',
              tag: item.tag || '推荐',
              tagClass: item.tagClass || 'tag-fast',
              baseMs: item.baseMs || 25,
              status: 'idle',
              isOfficial: true,
            });
          }
        });
      }
    }

    // 正则提取 PERMANENT_DOMAINS 对象
    const permMatch = jsCode.match(/const\s+PERMANENT_DOMAINS\s*=\s*(\[[\s\S]*?\]);/);
    if (permMatch && permMatch[1]) {
      const items = Function(`"use strict"; return (${permMatch[1]});`)();
      if (Array.isArray(items)) {
        items.forEach((item, idx) => {
          if (item && item.url) {
            permanent.push({
              id: `perm-remote-${idx + 1}`,
              name: item.name || `官方主入口 ${idx + 1}`,
              url: item.url,
              category: 'permanent',
              tag: item.tag || '主域',
              tagClass: item.tagClass || 'tag-perm',
              baseMs: item.speed ? parseInt(item.speed, 10) : 35,
              status: 'idle',
              isOfficial: true,
            });
          }
        });
      }
    }

    if (direct.length > 0 || permanent.length > 0) {
      return { direct, permanent };
    }
  } catch (err) {
    console.warn('解析发布页脚本失败：', err);
  }
  return null;
}

/**
 * 从 GitHub 官方发布页 (https://huangguotv.github.io/publish.js) 动态拉取最新轮换地址
 */
export async function syncLinesFromPublishPage(): Promise<{
  direct: ServerLine[];
  permanent: ServerLine[];
  fromRemote: boolean;
}> {
  const sources = [
    'https://huangguotv.github.io/publish.js',
    'https://huangguo88.pages.dev/publish.js',
  ];

  for (const src of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(src, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        const parsed = parsePublishScript(text);
        if (parsed && (parsed.direct.length > 0 || parsed.permanent.length > 0)) {
          saveStoredSyncedLines(parsed);
          return {
            direct: parsed.direct.length > 0 ? parsed.direct : DEFAULT_SPEED_LINES,
            permanent: parsed.permanent.length > 0 ? parsed.permanent : DEFAULT_PERMANENT_DOMAINS,
            fromRemote: true,
          };
        }
      }
    } catch {
      // 尝试下一个源
    }
  }

  // 若动态拉取失败，尝试读取本地缓存或默认列表
  const cached = getStoredSyncedLines();
  if (cached && (cached.direct.length > 0 || cached.permanent.length > 0)) {
    return {
      direct: cached.direct.length > 0 ? cached.direct : DEFAULT_SPEED_LINES,
      permanent: cached.permanent.length > 0 ? cached.permanent : DEFAULT_PERMANENT_DOMAINS,
      fromRemote: false,
    };
  }

  return {
    direct: DEFAULT_SPEED_LINES,
    permanent: DEFAULT_PERMANENT_DOMAINS,
    fromRemote: false,
  };
}

/**
 * 根据当前 baseUrl 查找匹配的线路信息
 */
export function findLineByUrl(
  allLines: ServerLine[],
  currentUrl: string
): ServerLine | undefined {
  if (!currentUrl) return undefined;
  const normalized = currentUrl.trim().replace(/\/+$/, '').toLowerCase();
  return allLines.find(
    (l) => l.url.trim().replace(/\/+$/, '').toLowerCase() === normalized
  );
}
