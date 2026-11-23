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

  // Sync publish page lines on initial open
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

  // Combine all lines
  const allLines = useMemo(() => {
    return [...directLines, ...permanentLines, ...customLines];
  }, [directLines, permanentLines, customLines]);

  // Determine current active line
  const activeLine = useMemo(() => {
    const normCurrent = currentBaseUrl.trim().replace(/\/+$/, '').toLowerCase();
    return allLines.find(
      (l) => l.url.trim().replace(/\/+$/, '').toLowerCase() === normCurrent
    );
  }, [allLines, currentBaseUrl]);

  // Ping a single line
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

  // Update a line's properties in state
  const updateLineStatus = (id: string, patch: Partial<ServerLine>) => {
    setDirectLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setPermanentLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setCustomLines((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
      saveStoredCustomLines(next);
      return next;
    });
  };

  // Ping all lines concurrently
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
        errorMessage: res.ok ? undefined : (res.error || '不可达'),
      });
      return { line, res };
    };

    const targetLines = [...directLines, ...permanentLines, ...customLines];
    await Promise.allSettled(targetLines.map(testItem));

    setIsTestingAll(false);
    onNotify('全网线路测速已完成');
  };

  // Auto switch to fastest line
  const handleSelectFastest = async () => {
    // If not tested yet, test direct lines first
    let candidates = allLines.filter((l) => l.status === 'online' && l.latencyMs && l.latencyMs > 0);

    if (candidates.length === 0) {
      onNotify('正在快速测速并挑选最佳线路...');
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
        onNotify('所有直连线路暂无响应，请检查手机网络设置或代理');
        return;
      }
      viable.sort((a, b) => a.res.latency - b.res.latency);
      const best = viable[0].line;
      onSelectLine(best.url, best.name);
      onNotify(`已智能切换至最快线路：${best.name} (${viable[0].res.latency}ms)`);
      onClose();
      return;
    }

    candidates.sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999));
    const best = candidates[0];
    onSelectLine(best.url, best.name);
    onNotify(`已切换至最快线路：${best.name} (${best.latencyMs}ms)`);
    onClose();
  };

  // Sync from publish page manually
  const handleSyncFromPublishPage = async () => {
    setIsSyncing(true);
    const result = await syncLinesFromPublishPage();
    setIsSyncing(false);

    if (result.direct.length > 0) setDirectLines(result.direct);
    if (result.permanent.length > 0) setPermanentLines(result.permanent);

    if (result.fromRemote) {
      onNotify('成功从 huangguotv.github.io 同步最新官方轮换线路！');
    } else {
      onNotify('已载入官方防封镜像与备用主干线路');
    }
  };

  // Add custom line
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

    const newLine: ServerLine = {
      id: `custom-${Date.now()}`,
      name: customNameInput.trim() || `自定义线路 (${new URL(normalized, window.location.origin).hostname})`,
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
      onNotify(`自定义线路测试成功 (${res.latency}ms) 并已添加`);
      onSelectLine(newLine.url, newLine.name);
    } else {
      onNotify(`自定义线路已保存（当前测试连通失败: ${res.error || '请确认地址'}）`);
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
      navigator.clipboard.writeText(PUBLISH_PAGE_URL);
      onNotify('已复制官方发布页网址：' + PUBLISH_PAGE_URL);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-[#14161D] border border-white/10 shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-[#171922]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 id="line-modal-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>短剧片源与网络线路选择</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  多线路容灾
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                同步自官方发布页 · 免翻极速直连 · 实时智能测速
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Line Banner */}
        <div className="px-5 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>当前使用：</span>
            <strong className="text-amber-300 font-mono">
              {activeLine ? activeLine.name : currentBaseUrl || '内置演示库'}
            </strong>
          </div>
          <span className="text-slate-400 font-mono truncate max-w-[240px]">
            {activeLine?.url || currentBaseUrl}
          </span>
        </div>

        {/* Global Action Toolbar */}
        <div className="px-5 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#12131A]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestAll}
              disabled={isTestingAll}
              className="min-h-[36px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B0C10] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Wifi className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-pulse' : ''}`} />
              <span>{isTestingAll ? '全网测速中...' : '一键测速'}</span>
            </button>

            <button
              type="button"
              onClick={handleSelectFastest}
              disabled={isTestingAll}
              className="min-h-[36px] px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>选最快线路</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSyncFromPublishPage}
            disabled={isSyncing}
            className="min-h-[36px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs inline-flex items-center gap-1.5 transition-colors ml-auto"
            title="从官方发布页 huangguotv.github.io 同步"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isSyncing ? '同步中...' : '同步发布页'}</span>
          </button>
        </div>

        {/* Segmented Category Tabs */}
        <div className="px-5 pt-3 pb-1 border-b border-white/[0.06] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`min-h-[36px] px-3.5 py-1 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'direct'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            国内直连 ({directLines.length}) · 免代理
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permanent')}
            className={`min-h-[36px] px-3.5 py-1 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'permanent'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            官方主干 ({permanentLines.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`min-h-[36px] px-3.5 py-1 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'custom'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            自建与本地 ({customLines.length})
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          
          {/* TAB 1: DIRECT LINES */}
          {activeTab === 'direct' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between pb-1">
                <span>国内用户推荐使用直连线路，智能分流无须开启代理翻墙：</span>
              </div>

              {directLines.map((line) => {
                const isSelected = activeLine?.id === line.id || currentBaseUrl.includes(new URL(line.url).hostname);
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

          {/* TAB 2: PERMANENT DOMAINS */}
          {activeTab === 'permanent' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 pb-1">
                黄果短剧永久核心域名，海外或具备科学网络环境时推荐连接：
              </div>

              {permanentLines.map((line) => {
                const isSelected = activeLine?.id === line.id || currentBaseUrl.includes(new URL(line.url).hostname);
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

          {/* TAB 3: CUSTOM / LOCAL LINES */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {/* Add form */}
              <form
                onSubmit={handleAddCustomLine}
                className="p-4 rounded-2xl bg-[#0B0C10] border border-white/10 space-y-3"
              >
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>添加自定义片源服务器</span>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://your-custom-mirror.com 或 /api-hg"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#14161D] border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customNameInput}
                      onChange={(e) => setCustomNameInput(e.target.value)}
                      placeholder="备注名称（可选）"
                      className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-[#14161D] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={customAdding || !customUrlInput.trim()}
                      className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B0C10] text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      {customAdding ? '测速中...' : '测试并添加'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Local Dev Presets */}
              <div className="p-3 rounded-2xl bg-[#0B0C10]/60 border border-white/[0.06] space-y-2">
                <span className="text-[11px] text-slate-400">本地与内置预设：</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLine('/api-hg', '本地 Vite 反向代理 (/api-hg)');
                      onNotify('已切换至本地 Vite 开发代理');
                      onClose();
                    }}
                    className="min-h-[32px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-300 font-mono transition-colors"
                  >
                    /api-hg (本地代理)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLine('', '内置精选离线库');
                      onNotify('已切换回内置短剧剧库');
                      onClose();
                    }}
                    className="min-h-[32px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-300 transition-colors"
                  >
                    内置离线剧库 (无网模式)
                  </button>
                </div>
              </div>

              {/* Saved custom list */}
              {customLines.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs text-slate-400">已保存的自定义线路：</span>
                  {customLines.map((line) => {
                    const isSelected = activeLine?.id === line.id || currentBaseUrl === line.url;
                    return (
                      <div
                        key={line.id}
                        className="p-3 rounded-2xl bg-[#0B0C10] border border-white/[0.08] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {line.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {line.url}
                          </div>
                          {line.latencyMs ? (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              ⚡ {line.latencyMs}ms
                            </span>
                          ) : line.errorMessage ? (
                            <span className="text-[10px] text-red-400 font-mono">
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
                            className={`min-h-[34px] px-3 rounded-xl text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500 hover:bg-amber-400 text-[#0B0C10]'
                            }`}
                          >
                            {isSelected ? '使用中' : '使用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomLine(line.id)}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Official Safety Notice & Anti-lost card */}
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-[#1A1C24] to-[#12131A] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4" />
                <span>官方防失联与最新发布页</span>
              </div>
              <button
                type="button"
                onClick={copyPublishUrl}
                className="text-[11px] text-slate-300 hover:text-amber-300 inline-flex items-center gap-1 transition-colors"
              >
                <Copy className="w-3 h-3" />
                <span>复制发布页</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              若遇不可抗力网络阻断，请访问 GitHub 发布页{' '}
              <a
                href={PUBLISH_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:underline inline-flex items-center gap-0.5 font-mono"
              >
                huangguotv.github.io
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>{' '}
              或发邮件至{' '}
              <a
                href={`mailto:${OFFICIAL_SUPPORT_EMAIL}?subject=获取最新地址`}
                className="text-amber-300 hover:underline font-mono"
              >
                {OFFICIAL_SUPPORT_EMAIL}
              </a>{' '}
              自动索取实时可用地址。
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
              {OFFICIAL_CHANNELS.map((ch) => (
                <a
                  key={ch.type}
                  href={ch.link}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 inline-flex items-center gap-1 transition-colors"
                >
                  <Globe className="w-2.5 h-2.5 text-amber-400" />
                  <span>{ch.title}</span>
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400 bg-[#12131A]">
          <span>遇到播放卡顿或加载失败，可随时在此切换线路</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium transition-colors"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
}

// Subcomponent: Individual Line Item Card
interface LineCardProps {
  line: ServerLine;
  isSelected: boolean;
  onSelect: () => void;
  onTest: () => void;
}

function LineCard({ line, isSelected, onSelect, onTest }: LineCardProps) {
  const getLatencyColor = (ms?: number) => {
    if (!ms) return 'text-slate-400 border-white/10 bg-white/5';
    if (ms < 80) return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    if (ms < 180) return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    return 'text-orange-300 border-orange-500/30 bg-orange-500/10';
  };

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
        isSelected
          ? 'bg-amber-500/[0.07] border-amber-500/50 shadow-lg shadow-amber-500/5'
          : 'bg-[#0B0C10] border-white/[0.08] hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        
        {/* Left: Line info */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
              {line.name}
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                line.tagClass === 'tag-fast'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : line.tagClass === 'tag-perm'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-slate-700/50 text-slate-300 border border-slate-600/40'
              }`}
            >
              {line.tag}
            </span>
            {isSelected && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-[#0B0C10] font-bold">
                当前连接
              </span>
            )}
          </div>

          <div className="text-[11px] font-mono text-slate-400 truncate">
            {line.url}
          </div>

          {/* Latency / Status output */}
          <div className="pt-1 flex items-center gap-2">
            {line.status === 'testing' ? (
              <span className="text-[11px] text-amber-400 font-mono inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>测速中...</span>
              </span>
            ) : line.latencyMs ? (
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${getLatencyColor(
                  line.latencyMs
                )}`}
              >
                <Zap className="w-3 h-3 fill-current" />
                <span>{line.latencyMs}ms</span>
              </span>
            ) : line.status === 'error' ? (
              <span className="text-[11px] text-red-400 font-mono inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{line.errorMessage || '连接失败'}</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-mono">
                预估延迟 ~{line.baseMs ?? 30}ms
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 self-center">
          <button
            type="button"
            onClick={onTest}
            className="min-h-[36px] px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 transition-colors"
            title="单独测速"
          >
            测速
          </button>

          <button
            type="button"
            onClick={onSelect}
            className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
              isSelected
                ? 'bg-emerald-500 text-[#0B0C10] cursor-default'
                : 'bg-amber-500 hover:bg-amber-400 text-[#0B0C10]'
            }`}
          >
            {isSelected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>使用中</span>
              </>
            ) : (
              <>
                <span>切换</span>
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
