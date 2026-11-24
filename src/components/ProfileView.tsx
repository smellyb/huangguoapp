import { FormEvent, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Play,
  PlugZap,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  isValidHttpUrl,
  normalizeBaseUrl,
  testCustomApiEndpoint,
} from '../services/dramaApi';
import {
  DEFAULT_SPEED_LINES,
  OFFICIAL_CHANNELS,
  OFFICIAL_SUPPORT_EMAIL,
  PUBLISH_PAGE_URL,
} from '../services/publishLines';
import type { ApiConfig, Drama, WatchHistoryEntry } from '../types/drama';
import { DramaCoverImage, DramaPoster } from './DramaPoster';

interface ProfileViewProps {
  dramas: Drama[];
  followedIds: string[];
  watchHistory: WatchHistoryEntry[];
  apiConfig: ApiConfig;
  activeDataSource: 'demo' | 'custom';
  currentLineLabel?: string;
  onPlayDrama: (drama: Drama, episodeNumber?: number, resumeSeconds?: number) => void;
  onToggleFollow: (dramaId: string) => void;
  onRemoveHistoryItem: (dramaId: string) => void;
  onClearHistory: () => void;
  onUpdateApiConfig: (patch: Partial<ApiConfig>) => void;
  onNotify: (message: string) => void;
  onOpenLineSelector?: () => void;
}

const API_SCHEMA_SNIPPET = `GET {baseUrl}/dramas
[
  {
    "id": "my-drama-01",
    "title": "剧集名称",
    "category": "短剧",
    "genres": ["科幻", "悬疑"],
    "posterUrl": "https://cdn.example.com/poster.jpg",
    "status": "连载中",
    "totalEpisodes": 30,
    "episodes": [
      {
        "number": 1,
        "title": "第 1 集",
        "durationSeconds": 90,
        "hlsUrl": "https://cdn.example.com/ep1/master.m3u8"
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
  currentLineLabel,
  onPlayDrama,
  onToggleFollow,
  onRemoveHistoryItem,
  onClearHistory,
  onUpdateApiConfig,
  onNotify,
  onOpenLineSelector,
}: ProfileViewProps) {
  const [section, setSection] = useState<'library' | 'api'>('library');
  const [apiInput, setApiInput] = useState(apiConfig.baseUrl);
  const [testing, setTesting] = useState(false);
  const [showDevDocs, setShowDevDocs] = useState(false);
  const [appVersion, setAppVersion] = useState('2.3.0');
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    CapApp.getInfo()
      .then((info) => {
        if (info?.version) {
          setAppVersion(info.version);
        }
      })
      .catch(() => null);
  }, []);

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
        message: '请输入以 http:// 或 https:// 开头的有效片源地址。',
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
      onNotify('已连接并切换至自定义片源');
    }
  };

  const handleResetOfficial = () => {
    onUpdateApiConfig({ mode: 'custom', baseUrl: 'https://huangguoai.com' });
    setApiInput('https://huangguoai.com');
    setTestResult(null);
    onNotify('已重置为官方片源接口');
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(API_SCHEMA_SNIPPET);
      onNotify('JSON 接口协议示例已复制');
    } catch {
      onNotify('请手动复制协议示例');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6">
      {/* Compact Header + Segmented Switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 pb-4 border-b border-white/[0.08]">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">我的剧库</h1>
          <p className="text-xs sm:text-sm text-slate-400 tabular-nums">
            追剧 {followedDramas.length} 部 <span aria-hidden="true">·</span> 观看记录{' '}
            {historyRows.length} 条 <span aria-hidden="true">·</span>{' '}
            {currentLineLabel ||
              (activeDataSource === 'custom' ? '在线片源' : '内置离线库')}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="个人中心栏目"
          className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-xl bg-[#14161D] border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'library'}
            onClick={() => setSection('library')}
            className={`min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
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
            className={`min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              section === 'api'
                ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            线路与片源
          </button>
        </div>
      </div>

      {section === 'library' ? (
        <div className="space-y-7">
          {/* Quick Line Status Row */}
          {onOpenLineSelector && (
            <button
              type="button"
              onClick={onOpenLineSelector}
              className="w-full text-left rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/40 px-4 py-3.5 flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    当前线路：{currentLineLabel || '默认线路'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    播放卡顿或加载慢？点击一键测速并切换最快线路
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            </button>
          )}

          {/* Continue Watching */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-white inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>继续观看</span>
              </h2>
              {historyRows.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="min-h-[40px] px-2 text-xs text-slate-400 hover:text-amber-400 inline-flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>清空</span>
                </button>
              )}
            </div>

            {historyRows.length === 0 ? (
              <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] py-10 px-6 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-200">暂无观看历史</p>
                <p className="text-xs text-slate-400">
                  看过的剧集会自动保存集数与播放断点
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {historyRows.map(({ entry, drama }) => {
                  const pct = Math.min(
                    100,
                    Math.round(
                      (entry.progressSeconds / Math.max(entry.durationSeconds, 1)) * 100
                    )
                  );
                  return (
                    <div
                      key={drama.id}
                      className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-3 flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onPlayDrama(drama, entry.episodeNumber, entry.progressSeconds)
                        }
                        className="relative w-14 aspect-[3/4] rounded-xl overflow-hidden bg-[#1D202A] shrink-0"
                      >
                        <DramaCoverImage
                          src={drama.posterUrl}
                          alt={drama.title}
                          fallbackId={drama.id}
                          title={drama.title}
                          category={drama.category}
                          compact
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/35 flex items-center justify-center pointer-events-none">
                          <Play
                            className="w-4 h-4 text-white fill-current"
                            aria-hidden="true"
                          />
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onPlayDrama(drama, entry.episodeNumber, entry.progressSeconds)
                        }
                        className="min-w-0 flex-1 text-left space-y-1.5 py-1"
                      >
                        <h3 className="text-sm font-semibold text-white truncate">
                          {drama.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono tabular-nums truncate">
                          第 {entry.episodeNumber} 集 · {pct}% ·{' '}
                          {formatRelativeTime(entry.updatedAt)}
                        </p>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>

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
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-white inline-flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>我的追剧</span>
            </h2>

            {followedDramas.length === 0 ? (
              <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] py-10 px-6 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-200">还没有追剧收藏</p>
                <p className="text-xs text-slate-400">
                  在播放页点一下右侧「追剧」，即可在此快速续看
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
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
        <div className="space-y-5">
          {/* Quick Line Selector Card */}
          <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>极速直连线路</span>
                </h2>
                <p className="text-xs text-slate-400">
                  点击快捷切换，或打开测速面板自动挑选延迟最低的线路
                </p>
              </div>

              {onOpenLineSelector && (
                <button
                  type="button"
                  onClick={onOpenLineSelector}
                  className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0 active:scale-95"
                >
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>打开测速换线</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEFAULT_SPEED_LINES.slice(0, 4).map((line) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => {
                    setApiInput(line.url);
                    onUpdateApiConfig({ mode: 'custom', baseUrl: line.url });
                    onNotify(`已切换至：${line.name}`);
                  }}
                  className="min-h-[54px] px-3.5 py-2.5 rounded-xl bg-[#0B0C10] hover:bg-white/[0.06] border border-white/[0.08] text-left transition-colors flex items-center justify-between gap-2 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                      {line.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate">
                      {line.url}
                    </div>
                  </div>
                  <span className="text-xs text-amber-400 font-medium shrink-0">
                    使用
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Server Input */}
          <form
            onSubmit={handleTestAndSave}
            className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-4 sm:p-6 space-y-4"
          >
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>自定义片源地址</span>
              </h2>
              <p className="text-xs text-slate-400">
                支持官方轮换镜像、HTTPS 片源接口或本地代理路径
              </p>
            </div>

            <div className="space-y-2.5">
              <input
                id="custom-api-url"
                type="text"
                value={apiInput}
                onChange={(e) => setApiInput(e.target.value)}
                placeholder="https://huangguoai.com"
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#0B0C10] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setApiInput('https://huangguoai.com')}
                  className="min-h-[36px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs transition-colors"
                >
                  主站 (huangguoai.com)
                </button>
                <button
                  type="button"
                  onClick={() => setApiInput('https://huangguoai.ai')}
                  className="min-h-[36px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs transition-colors"
                >
                  中转 (huangguoai.ai)
                </button>
                <button
                  type="button"
                  onClick={() => setApiInput('/api-hg')}
                  className="min-h-[36px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs transition-colors"
                >
                  本地代理 (/api-hg)
                </button>
              </div>
            </div>

            {testResult && (
              <div
                role="status"
                className={`rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
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

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={testing}
                className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#0B0C10] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <PlugZap className="w-4 h-4" aria-hidden="true" />
                <span>{testing ? '检测连通中...' : '测试并应用'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetOfficial}
                className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Database className="w-4 h-4" aria-hidden="true" />
                <span>恢复默认</span>
              </button>
            </div>
          </form>

          {/* Official Channels */}
          <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>官方防失联发布页</span>
              </h3>
              <a
                href={PUBLISH_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 font-mono"
              >
                <span>huangguotv.github.io</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              遇到线路阻断时，可发送邮件至{' '}
              <a
                href={`mailto:${OFFICIAL_SUPPORT_EMAIL}`}
                className="text-amber-300 underline font-mono"
              >
                {OFFICIAL_SUPPORT_EMAIL}
              </a>{' '}
              自动获取最新可用地址。
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {OFFICIAL_CHANNELS.map((ch) => (
                <a
                  key={ch.type}
                  href={ch.link}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[48px] px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/[0.08] hover:border-amber-500/30 transition-colors flex items-center gap-2"
                >
                  <Globe className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {ch.title}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {ch.handle}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Collapsible Advanced Developer Docs (Kept out of casual viewers' way) */}
          <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDevDocs((v) => !v)}
              aria-expanded={showDevDocs}
              className="w-full min-h-[52px] px-4 sm:px-6 flex items-center justify-between gap-3 text-left text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span>高级设置 · 开发者自建片源协议与 CDN 建议</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  showDevDocs ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {showDevDocs && (
              <div className="px-4 sm:px-6 pb-5 pt-2 border-t border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    标准 JSON 返回格式
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="min-h-[36px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>复制示例</span>
                  </button>
                </div>

                <pre className="rounded-xl bg-[#0B0C10] border border-white/[0.08] p-3.5 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                  {API_SCHEMA_SNIPPET}
                </pre>

                <ul className="space-y-2 text-xs text-slate-400 leading-relaxed list-disc list-inside">
                  <li>优先提供 HLS（.m3u8）多码率切片与 CORS 跨域头，支持平滑自适应码率与下一集静默预加载。</li>
                  <li>MP4 片源建议开启 <code className="font-mono text-slate-200">-movflags +faststart</code> 与 <code className="font-mono text-slate-200">Accept-Ranges: bytes</code>。</li>
                  <li>可在部署环境变量设置 <code className="font-mono text-slate-200">VITE_DRAMA_API_BASE_URL</code> 指定默认片源。</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      {/* App Version Info Footer */}
      <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-4 sm:p-5 flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
            HG
          </div>
          <div>
            <div className="font-semibold text-white text-sm">黄果短剧</div>
            <div className="text-[11px] text-slate-500 font-mono">
              Android 原生客户端 · Media3 硬件加速
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-amber-400 font-mono font-semibold text-xs">
            v{appVersion}
          </span>
          <div className="text-[10px] text-emerald-400 mt-1 flex items-center justify-end gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
            <span>已是最新版本</span>
          </div>
        </div>
      </div>
    </div>
  );
}
