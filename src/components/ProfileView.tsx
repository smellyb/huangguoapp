import { FormEvent, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Play,
  PlugZap,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  isValidHttpUrl,
  normalizeBaseUrl,
  testCustomApiEndpoint,
} from '../services/dramaApi';
import type { ApiConfig, Drama, WatchHistoryEntry } from '../types/drama';
import { DramaPoster } from './DramaPoster';

interface ProfileViewProps {
  dramas: Drama[];
  followedIds: string[];
  watchHistory: WatchHistoryEntry[];
  apiConfig: ApiConfig;
  activeDataSource: 'demo' | 'custom';
  onPlayDrama: (drama: Drama, episodeNumber?: number, resumeSeconds?: number) => void;
  onToggleFollow: (dramaId: string) => void;
  onRemoveHistoryItem: (dramaId: string) => void;
  onClearHistory: () => void;
  onUpdateApiConfig: (patch: Partial<ApiConfig>) => void;
  onNotify: (message: string) => void;
}

const API_SCHEMA_SNIPPET = `GET {baseUrl}/dramas
[
  {
    "id": "my-drama-01",
    "title": "剧集名称",
    "category": "AI短剧",
    "genres": ["科幻", "悬疑"],
    "posterUrl": "https://cdn.example.com/poster.jpg",
    "status": "连载中",
    "totalEpisodes": 30,
    "episodes": [
      {
        "number": 1,
        "title": "第 1 集",
        "durationSeconds": 90,
        "hlsUrl": "https://cdn.example.com/ep1/master.m3u8",
        "videoUrl": "https://cdn.example.com/ep1/video.mp4",
        "posterUrl": "https://cdn.example.com/ep1/frame.jpg"
      }
    ]
  }
]`;

function formatRelativeTime(timestamp: number): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  return `${Math.floor(diffHour / 24)} 天前`;
}

export function ProfileView({
  dramas,
  followedIds,
  watchHistory,
  apiConfig,
  activeDataSource,
  onPlayDrama,
  onToggleFollow,
  onRemoveHistoryItem,
  onClearHistory,
  onUpdateApiConfig,
  onNotify,
}: ProfileViewProps) {
  const [section, setSection] = useState<'library' | 'api'>('library');
  const [apiInput, setApiInput] = useState(apiConfig.baseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const dramaMap = useMemo(
    () => new Map(dramas.map((d) => [d.id, d])),
    [dramas]
  );

  const historyRows = useMemo(
    () =>
      watchHistory
        .map((entry) => ({
          entry,
          drama: dramaMap.get(entry.dramaId),
        }))
        .filter((row): row is { entry: WatchHistoryEntry; drama: Drama } =>
          Boolean(row.drama)
        ),
    [dramaMap, watchHistory]
  );

  const followedDramas = useMemo(
    () =>
      followedIds
        .map((id) => dramaMap.get(id))
        .filter((item): item is Drama => Boolean(item)),
    [dramaMap, followedIds]
  );

  const handleTestAndSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = apiInput.trim();
    if (!isValidHttpUrl(trimmed)) {
      setTestResult({
        ok: false,
        message: '请输入以 http:// 或 https:// 开头的有效片源 API 基地址。',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const result = await testCustomApiEndpoint(trimmed);
    setTesting(false);
    setTestResult({ ok: result.ok, message: result.message });

    if (result.ok) {
      onUpdateApiConfig({
        mode: 'custom',
        baseUrl: normalizeBaseUrl(trimmed),
      });
      onNotify('已连接并切换至自定义片源接口');
    }
  };

  const handleUseDemoMode = () => {
    onUpdateApiConfig({ mode: 'demo' });
    setTestResult(null);
    onNotify('已切换回内置精选短剧片源库');
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(API_SCHEMA_SNIPPET);
      onNotify('JSON 接口协议示例已复制');
    } catch {
      onNotify('请手动选中并复制协议示例');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      {/* Header + Segmented Section Switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">我的剧库</h1>
          <p className="text-xs sm:text-sm text-slate-400 tabular-nums">
            追剧 {followedDramas.length} 部 <span aria-hidden="true">·</span> 观看记录{' '}
            {historyRows.length} 条 <span aria-hidden="true">·</span> 当前片源：
            {activeDataSource === 'custom' ? '自定义远程接口' : '内置精选演示库'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="个人中心栏目"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#14161D] border border-white/[0.08] self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'library'}
            onClick={() => setSection('library')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              section === 'library'
                ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            追剧与历史
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'api'}
            onClick={() => setSection('api')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              section === 'api'
                ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            片源 API 配置
          </button>
        </div>
      </div>

      {section === 'library' ? (
        <div className="space-y-10">
          {/* Continue Watching */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-white inline-flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" aria-hidden="true" />
                <span>继续观看</span>
              </h2>
              {historyRows.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="min-h-[40px] px-2 text-xs text-slate-400 hover:text-amber-400 inline-flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>清空历史</span>
                </button>
              )}
            </div>

            {historyRows.length === 0 ? (
              <div className="rounded-3xl bg-[#14161D] border border-white/[0.08] py-12 px-6 text-center space-y-2">
                <p className="text-sm font-medium text-slate-200">暂无观看历史</p>
                <p className="text-xs text-slate-400">
                  在发现页或剧场观看短剧后，系统会自动记录您的集数与断点时间。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyRows.map(({ entry, drama }) => {
                  const pct = Math.min(
                    100,
                    Math.round((entry.progressSeconds / Math.max(entry.durationSeconds, 1)) * 100)
                  );
                  return (
                    <div
                      key={drama.id}
                      className="group rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/40 p-3.5 flex items-center gap-3.5 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onPlayDrama(drama, entry.episodeNumber, entry.progressSeconds)
                        }
                        className="relative w-16 aspect-[3/4] rounded-xl overflow-hidden bg-[#1D202A] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <img
                          src={drama.posterUrl}
                          alt={drama.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <Play
                            className="w-5 h-5 text-white fill-current"
                            aria-hidden="true"
                          />
                        </span>
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            onPlayDrama(drama, entry.episodeNumber, entry.progressSeconds)
                          }
                          className="text-left block w-full focus-visible:outline-none"
                        >
                          <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                            {drama.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                            续播第 {entry.episodeNumber} 集 · 已看 {pct}% ·{' '}
                            {formatRelativeTime(entry.updatedAt)}
                          </p>
                        </button>

                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveHistoryItem(drama.id)}
                        aria-label={`移除 ${drama.title} 的观看记录`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 rounded-xl transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Followed Dramas */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-white inline-flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-amber-400" aria-hidden="true" />
              <span>我的追剧</span>
            </h2>

            {followedDramas.length === 0 ? (
              <div className="rounded-3xl bg-[#14161D] border border-white/[0.08] py-12 px-6 text-center space-y-2">
                <p className="text-sm font-medium text-slate-200">还没有收藏追剧</p>
                <p className="text-xs text-slate-400">
                  点击任意短剧的“加入追剧”按钮即可在此集中管理更新进度。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                {followedDramas.map((drama) => (
                  <div key={drama.id} className="space-y-2">
                    <DramaPoster
                      drama={drama}
                      onSelect={(item) => onPlayDrama(item)}
                      compact
                    />
                    <button
                      type="button"
                      onClick={() => onToggleFollow(drama.id)}
                      className="w-full min-h-[38px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      取消追剧
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Custom Piece-Source API Configuration Center */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            <form
              onSubmit={handleTestAndSave}
              className="rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white inline-flex items-center gap-2">
                  <Server className="w-5 h-5 text-amber-400" aria-hidden="true" />
                  <span>接入自有短剧片源 API</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  填写您的片源服务基地址（如{' '}
                  <code className="font-mono text-slate-200">https://api.yourdomain.com</code>
                  ），前端将通过 <code className="font-mono text-slate-200">GET /dramas</code>{' '}
                  拉取剧库并自动启用 HLS 自适应码率播放与下一集预加载。
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="custom-api-url"
                  className="block text-xs font-medium text-slate-300"
                >
                  片源 API 基地址（支持 HTTPS / HTTP）
                </label>
                <input
                  id="custom-api-url"
                  type="url"
                  value={apiInput}
                  onChange={(e) => setApiInput(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#0B0C10] border border-white/15 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {testResult && (
                <div
                  role="status"
                  className={`rounded-xl px-4 py-3 text-xs sm:text-sm flex items-start gap-2.5 border ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-red-500/10 border-red-500/30 text-red-200'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={testing}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#0B0C10] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <PlugZap className="w-4 h-4" aria-hidden="true" />
                  <span>{testing ? '正在检测连通性...' : '测试并应用自定义片源'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleUseDemoMode}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Database className="w-4 h-4" aria-hidden="true" />
                  <span>使用内置精选库</span>
                </button>
              </div>
            </form>

            {/* Smooth Playback CDN Checklist */}
            <div className="rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 space-y-4">
              <h3 className="text-base font-bold text-white">
                流畅播放 / 防卡顿片源配置清单
              </h3>
              <ol className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  <span className="font-semibold text-white">优先使用 HLS（.m3u8）多码率切片</span>
                  ：每片 2–4 秒并提供 480P / 720P / 1080P 主列表，播放器内置 hls.js 会随网速自动无缝切换码率。
                </li>
                <li>
                  <span className="font-semibold text-white">MP4 务必开启 faststart 与 Range</span>
                  ：转码加入 <code className="font-mono text-amber-300">-movflags +faststart</code>{' '}
                  并在 CDN 开启 <code className="font-mono text-amber-300">Accept-Ranges: bytes</code>，实现边下边播与快速拖拽。
                </li>
                <li>
                  <span className="font-semibold text-white">配置视频 CDN 跨域响应头（CORS）</span>
                  ：返回 <code className="font-mono text-amber-300">Access-Control-Allow-Origin</code>，保障下一集 60% 进度自动静默预加载生效。
                </li>
                <li>
                  <span className="font-semibold text-white">为每集提供 posterUrl 首帧图</span>
                  ：切集瞬间由首帧图无缝垫底，视频首帧解码完成后平滑淡入，消除黑屏闪烁。
                </li>
              </ol>
            </div>
          </div>

          {/* Standardized JSON Protocol Reference */}
          <div className="lg:col-span-5 rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-white">标准接口返回格式</h3>
              <button
                type="button"
                onClick={handleCopySchema}
                className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>复制示例</span>
              </button>
            </div>

            <pre className="rounded-2xl bg-[#0B0C10] border border-white/[0.08] p-4 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {API_SCHEMA_SNIPPET}
            </pre>

            <p className="text-xs text-slate-400 leading-relaxed">
              也可在部署环境变量中配置{' '}
              <code className="font-mono text-slate-200">VITE_DRAMA_API_BASE_URL</code>
              ，应用启动时将自动拉取您的远程片源。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
