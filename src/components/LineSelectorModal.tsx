import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_PERMANENT_DOMAINS,
  DEFAULT_SPEED_LINES,
  OFFICIAL_CHANNELS,
  OFFICIAL_SUPPORT_EMAIL,
  PUBLISH_PAGE_URL,
  ServerLine,
  getStoredCustomLines,
  saveStoredCustomLines,
  syncLinesFromPublishPage,
  testLineLatency,
} from '../services/publishLines';
import { isValidHttpUrl, normalizeBaseUrl } from '../services/dramaApi';

interface LineSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBaseUrl: string;
  onSelectLine: (lineUrl: string, lineName: string) => void;
  onNotify: (msg: string) => void;
}

export function LineSelectorModal({
  isOpen,
  onClose,
  currentBaseUrl,
  onSelectLine,
  onNotify,
}: LineSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<'direct' | 'permanent' | 'custom'>('direct');
  const [directLines, setDirectLines] = useState<ServerLine[]>(DEFAULT_SPEED_LINES);
  const [permanentLines, setPermanentLines] = useState<ServerLine[]>(DEFAULT_PERMANENT_DOMAINS);
  const [customLines, setCustomLines] = useState<ServerLine[]>(getStoredCustomLines);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customNameInput, setCustomNameInput] = useState('');
  const [customAdding, setCustomAdding] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const runSync = async () => {
      const result = await syncLinesFromPublishPage();
      if (cancelled) return;
      if (result.direct.length > 0) setDirectLines(result.direct);
      if (result.permanent.length > 0) setPermanentLines(result.permanent);
    };

    runSync();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const allLines = useMemo(() => {
    return [...directLines, ...permanentLines, ...customLines];
  }, [directLines, permanentLines, customLines]);

  const activeLine = useMemo(() => {
    const normCurrent = currentBaseUrl.trim().replace(/\/+$/, '').toLowerCase();
    return allLines.find(
      (l) => l.url.trim().replace(/\/+$/, '').toLowerCase() === normCurrent
    );
  }, [allLines, currentBaseUrl]);

  const updateLineStatus = (id: string, patch: Partial<ServerLine>) => {
    setDirectLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setPermanentLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setCustomLines((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
      saveStoredCustomLines(next);
      return next;
    });
  };

  const handleTestSingleLine = async (line: ServerLine) => {
    updateLineStatus(line.id, { status: 'testing', errorMessage: undefined });
    const res = await testLineLatency(line.url);
    if (res.ok) {
      updateLineStatus(line.id, {
        status: 'online',
        latencyMs: res.latency,
        errorMessage: undefined,
      });
    } else {
      updateLineStatus(line.id, {
        status: 'error',
        latencyMs: undefined,
        errorMessage: res.error || '连接失败',
      });
    }
  };

  const handleTestAll = async () => {
    if (isTestingAll) return;
    setIsTestingAll(true);

    const markTesting = (list: ServerLine[]) =>
      list.map((l) => ({ ...l, status: 'testing' as const, errorMessage: undefined }));
    setDirectLines(markTesting);
    setPermanentLines(markTesting);
    setCustomLines(markTesting);

    const testItem = async (line: ServerLine) => {
      const res = await testLineLatency(line.url);
      updateLineStatus(line.id, {
        status: res.ok ? 'online' : 'error',
        latencyMs: res.ok ? res.latency : undefined,
        errorMessage: res.ok ? undefined : res.error || '不可达',
      });
      return { line, res };
    };

    const targetLines = [...directLines, ...permanentLines, ...customLines];
    await Promise.allSettled(targetLines.map(testItem));

    setIsTestingAll(false);
    onNotify('全网线路测速已完成');
  };

  const handleSelectFastest = async () => {
    const candidates = allLines.filter(
      (l) => l.status === 'online' && l.latencyMs && l.latencyMs > 0
    );

    if (candidates.length === 0) {
      onNotify('正在测速并挑选最快线路...');
      setIsTestingAll(true);
      const results = await Promise.all(
        directLines.map(async (line) => {
          const res = await testLineLatency(line.url);
          updateLineStatus(line.id, {
            status: res.ok ? 'online' : 'error',
            latencyMs: res.ok ? res.latency : undefined,
            errorMessage: res.ok ? undefined : res.error,
          });
          return { line, res };
        })
      );
      setIsTestingAll(false);

      const viable = results.filter((r) => r.res.ok);
      if (viable.length === 0) {
        onNotify('直连线路暂无响应，请检查网络或尝试切换主干线路');
        return;
      }
      viable.sort((a, b) => a.res.latency - b.res.latency);
      const best = viable[0].line;
      onSelectLine(best.url, best.name);
      onNotify(`已切换至最快线路：${best.name} (${viable[0].res.latency}ms)`);
      onClose();
      return;
    }

    candidates.sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999));
    const best = candidates[0];
    onSelectLine(best.url, best.name);
    onNotify(`已切换至最快线路：${best.name} (${best.latencyMs}ms)`);
    onClose();
  };

  const handleSyncFromPublishPage = async () => {
    setIsSyncing(true);
    const result = await syncLinesFromPublishPage();
    setIsSyncing(false);

    if (result.direct.length > 0) setDirectLines(result.direct);
    if (result.permanent.length > 0) setPermanentLines(result.permanent);

    if (result.fromRemote) {
      onNotify('已同步最新官方轮换线路');
    } else {
      onNotify('已载入备用镜像与主干线路');
    }
  };

  const handleAddCustomLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = customUrlInput.trim();
    if (!trimmedUrl) return;

    if (!isValidHttpUrl(trimmedUrl)) {
      onNotify('请输入以 http:// 或 https:// 开头的有效网址');
      return;
    }

    setCustomAdding(true);
    const normalized = normalizeBaseUrl(trimmedUrl);
    const res = await testLineLatency(normalized);
    setCustomAdding(false);

    let fallbackHost = '自定义线路';
    try {
      fallbackHost = new URL(normalized, window.location.origin).hostname || fallbackHost;
    } catch {
      // Keep default label
    }

    const newLine: ServerLine = {
      id: `custom-${Date.now()}`,
      name: customNameInput.trim() || `自定义 (${fallbackHost})`,
      url: normalized,
      category: 'custom',
      tag: '自建',
      tagClass: 'tag-custom',
      status: res.ok ? 'online' : 'error',
      latencyMs: res.ok ? res.latency : undefined,
      errorMessage: res.ok ? undefined : res.error,
    };

    const nextCustom = [newLine, ...customLines];
    setCustomLines(nextCustom);
    saveStoredCustomLines(nextCustom);
    setCustomUrlInput('');
    setCustomNameInput('');

    if (res.ok) {
      onNotify(`自定义线路已添加 (${res.latency}ms)`);
      onSelectLine(newLine.url, newLine.name);
    } else {
      onNotify(`已保存，但连通检测失败：${res.error || '请确认地址'}`);
    }
  };

  const handleRemoveCustomLine = (id: string) => {
    const next = customLines.filter((l) => l.id !== id);
    setCustomLines(next);
    saveStoredCustomLines(next);
    onNotify('已删除自定义线路');
  };

  const copyPublishUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(PUBLISH_PAGE_URL).catch(() => undefined);
      onNotify('已复制官方发布页网址');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-5 bg-black/75 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up relative w-full max-w-2xl max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#14161D] border-t sm:border border-white/10 shadow-2xl overflow-hidden pb-safe"
      >
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Sheet Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="line-modal-title"
              className="text-base sm:text-lg font-bold text-white truncate"
            >
              切换片源线路
            </h2>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              当前：{activeLine ? activeLine.name : currentBaseUrl || '内置离线库'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭线路面板"
            className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/[0.08] flex items-center gap-2 overflow-x-auto no-scrollbar bg-[#11131A]">
          <button
            type="button"
            onClick={handleSelectFastest}
            disabled={isTestingAll}
            className="min-h-[40px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B0C10] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>智能选最快</span>
          </button>

          <button
            type="button"
            onClick={handleTestAll}
            disabled={isTestingAll}
            className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] disabled:opacity-50 text-slate-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 active:scale-95"
          >
            <Wifi className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>{isTestingAll ? '测速中...' : '全部测速'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncFromPublishPage}
            disabled={isSyncing}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ml-auto active:scale-95"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`}
              aria-hidden="true"
            />
            <span>{isSyncing ? '同步中' : '同步发布页'}</span>
          </button>
        </div>

        {/* Single-Line Category Tabs */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'direct'
                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            国内直连 ({directLines.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permanent')}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'permanent'
                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            官方主干 ({permanentLines.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'custom'
                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            自建与离线 ({customLines.length})
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {activeTab === 'direct' && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400">
                免代理极速线路，播放卡顿时点击「智能选最快」或手动切换。
              </p>

              {directLines.map((line) => {
                let hostname = '';
                try {
                  hostname = new URL(line.url).hostname;
                } catch {
                  hostname = line.url;
                }
                const isSelected =
                  activeLine?.id === line.id ||
                  (hostname !== '' && currentBaseUrl.includes(hostname));
                return (
                  <LineCard
                    key={line.id}
                    line={line}
                    isSelected={isSelected}
                    onSelect={() => {
                      onSelectLine(line.url, line.name);
                      onNotify(`已切换至：${line.name}`);
                      onClose();
                    }}
                    onTest={() => handleTestSingleLine(line)}
                  />
                );
              })}
            </div>
          )}

          {activeTab === 'permanent' && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400">
                官方永久核心域名，海外或代理网络环境推荐连接。
              </p>

              {permanentLines.map((line) => {
                let hostname = '';
                try {
                  hostname = new URL(line.url).hostname;
                } catch {
                  hostname = line.url;
                }
                const isSelected =
                  activeLine?.id === line.id ||
                  (hostname !== '' && currentBaseUrl.includes(hostname));
                return (
                  <LineCard
                    key={line.id}
                    line={line}
                    isSelected={isSelected}
                    onSelect={() => {
                      onSelectLine(line.url, line.name);
                      onNotify(`已切换至：${line.name}`);
                      onClose();
                    }}
                    onTest={() => handleTestSingleLine(line)}
                  />
                );
              })}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddCustomLine}
                className="p-4 rounded-2xl bg-[#0B0C10] border border-white/[0.08] space-y-3"
              >
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>添加自定义片源地址</span>
                </div>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://your-mirror.com 或 /api-hg"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#14161D] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customNameInput}
                      onChange={(e) => setCustomNameInput(e.target.value)}
                      placeholder="备注名称（可选）"
                      className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#14161D] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={customAdding || !customUrlInput.trim()}
                      className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B0C10] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      {customAdding ? '测速中' : '测试并添加'}
                    </button>
                  </div>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectLine('/api-hg', '本地开发代理 (/api-hg)');
                    onNotify('已切换至本地代理');
                    onClose();
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 font-mono transition-colors"
                >
                  /api-hg 本地代理
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectLine('', '内置离线剧库');
                    onNotify('已切换为内置离线剧库');
                    onClose();
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 transition-colors"
                >
                  内置离线剧库（无网可用）
                </button>
              </div>

              {customLines.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">已保存的自定义线路</p>
                  {customLines.map((line) => {
                    const isSelected =
                      activeLine?.id === line.id || currentBaseUrl === line.url;
                    return (
                      <div
                        key={line.id}
                        className="p-3.5 rounded-2xl bg-[#0B0C10] border border-white/[0.08] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-sm font-semibold text-white truncate">
                            {line.name}
                          </div>
                          <div className="text-xs font-mono text-slate-400 truncate">
                            {line.url}
                          </div>
                          {line.latencyMs ? (
                            <span className="text-xs text-emerald-400 font-mono tabular-nums">
                              {line.latencyMs}ms
                            </span>
                          ) : line.errorMessage ? (
                            <span className="text-xs text-red-400">
                              {line.errorMessage}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectLine(line.url, line.name);
                              onNotify(`已切换至：${line.name}`);
                              onClose();
                            }}
                            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500 hover:bg-amber-400 text-[#0B0C10]'
                            }`}
                          >
                            {isSelected ? '使用中' : '使用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomLine(line.id)}
                            aria-label={`删除 ${line.name}`}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Anti-lost Notice */}
          <div className="mt-3 p-4 rounded-2xl bg-[#0B0C10] border border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>官方防失联发布页</span>
              </div>
              <button
                type="button"
                onClick={copyPublishUrl}
                className="min-h-[36px] px-2.5 rounded-lg text-xs text-slate-300 hover:text-amber-300 inline-flex items-center gap-1 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>复制网址</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              访问{' '}
              <a
                href={PUBLISH_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:underline inline-flex items-center gap-0.5 font-mono"
              >
                huangguotv.github.io
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>{' '}
              或发邮件至{' '}
              <a
                href={`mailto:${OFFICIAL_SUPPORT_EMAIL}?subject=获取最新地址`}
                className="text-amber-300 hover:underline font-mono"
              >
                {OFFICIAL_SUPPORT_EMAIL}
              </a>{' '}
              获取最新可用线路。
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {OFFICIAL_CHANNELS.map((ch) => (
                <a
                  key={ch.type}
                  href={ch.link}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[36px] px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-300 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Globe className="w-3 h-3 text-amber-400" aria-hidden="true" />
                  <span>{ch.title}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LineCardProps {
  line: ServerLine;
  isSelected: boolean;
  onSelect: () => void;
  onTest: () => void;
}

function LineCard({ line, isSelected, onSelect, onTest }: LineCardProps) {
  const latencyColor = !line.latencyMs
    ? 'text-slate-400'
    : line.latencyMs < 100
      ? 'text-emerald-400'
      : line.latencyMs < 220
        ? 'text-amber-300'
        : 'text-orange-400';

  return (
    <div
      className={`p-3.5 rounded-2xl border transition-colors ${
        isSelected
          ? 'bg-amber-500/[0.08] border-amber-500/45'
          : 'bg-[#0B0C10] border-white/[0.08] hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="truncate">{line.name}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{line.tag}</span>
            <span aria-hidden="true">·</span>
            {line.status === 'testing' ? (
              <span className="text-amber-400 inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                测速中
              </span>
            ) : line.latencyMs ? (
              <span className={latencyColor}>{line.latencyMs}ms</span>
            ) : line.status === 'error' ? (
              <span className="text-red-400 inline-flex items-center gap-1 truncate">
                <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{line.errorMessage || '连接失败'}</span>
              </span>
            ) : (
              <span>约 {line.baseMs ?? 30}ms</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTest}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-300 transition-colors whitespace-nowrap active:scale-95"
          >
            测速
          </button>

          <button
            type="button"
            onClick={onSelect}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap active:scale-95 ${
              isSelected
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                : 'bg-amber-500 hover:bg-amber-400 text-[#0B0C10]'
            }`}
          >
            {isSelected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>当前</span>
              </>
            ) : (
              <>
                <span>切换</span>
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
