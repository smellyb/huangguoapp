import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Clapperboard, Compass, Play, Search, User, Wifi } from 'lucide-react';
import { DiscoverView } from './components/DiscoverView';
import { LineSelectorModal } from './components/LineSelectorModal';
import { ProfileView } from './components/ProfileView';
import { SearchView } from './components/SearchView';
import { TheaterPlayer } from './components/TheaterPlayer';
import { useUserLibrary } from './hooks/useUserLibrary';
import { fetchDramaDetail, loadDramaCatalog } from './services/dramaApi';
import { DEFAULT_PERMANENT_DOMAINS, DEFAULT_SPEED_LINES } from './services/publishLines';
import Media3Player, { isNativeMedia3Available } from './plugins/media3Player';
import type { AppTab, Drama, Topic } from './types/drama';

interface DesktopNavItem {
  id: string;
  label: string;
  tab?: AppTab;
  category?: string;
  action?: 'line' | 'app';
}

const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: 'nav-home', label: '首页', tab: 'discover', category: '全部' },
  { id: 'nav-original', label: '黄果原创', tab: 'discover', category: '黄果原创' },
  { id: 'nav-duanju', label: '短剧', tab: 'discover', category: '短剧' },
  { id: 'nav-manju', label: '漫剧', tab: 'discover', category: '漫剧' },
  { id: 'nav-topics', label: '专题', tab: 'discover', category: '专题' },
  { id: 'nav-ranks', label: '排行榜', tab: 'discover', category: '排行榜' },
  { id: 'nav-blog', label: '博客 ▾', tab: 'discover', category: 'AI魔改' },
  { id: 'nav-path', label: '回家的路', action: 'line' },
  { id: 'nav-search', label: '搜索', tab: 'search' },
  { id: 'nav-profile', label: '我的', tab: 'profile' },
];

const MOBILE_NAV_ITEMS: { id: AppTab; label: string; icon: typeof Compass }[] = [
  { id: 'discover', label: '首页', icon: Compass },
  { id: 'theater', label: '剧场', icon: Clapperboard },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'profile', label: '我的', icon: User },
];

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none shrink-0">
      <div className="relative w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center">
        <div className="absolute -top-0.5 right-1 w-2 h-1.5 rounded-full bg-emerald-400 rotate-45 transform origin-bottom-left" />
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 flex items-center justify-center">
          <div className="w-0 h-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-white ml-0.5" />
        </div>
      </div>
      <span className="font-display text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">
        {compact ? '黄果' : '黄果短剧'}
      </span>
    </div>
  );
}

export default function App() {
  const {
    state,
    toggleFollow,
    toggleLikeEpisode,
    recordProgress,
    removeHistoryItem,
    clearHistory,
    addSearchTerm,
    removeSearchTerm,
    clearSearchHistory,
    updateApiConfig,
  } = useUserLibrary();

  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const [returnTab, setReturnTab] = useState<AppTab>('discover');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [selectedTag, setSelectedTag] = useState<string>('全部');
  const [dramas, setDramas] = useState<Drama[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [dataSource, setDataSource] = useState<'demo' | 'custom'>('custom');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogWarning, setCatalogWarning] = useState<string | undefined>();

  const [currentDramaId, setCurrentDramaId] = useState<string>(
    state.watchHistory[0]?.dramaId ?? ''
  );
  const [selectedDrama, setSelectedDrama] = useState<Drama | null>(null);
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number>(
    state.watchHistory[0]?.episodeNumber ?? 1
  );
  const [resumeSeconds, setResumeSeconds] = useState<number>(
    state.watchHistory[0]?.progressSeconds ?? 0
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);

  // Refs for clean hardware/gesture Back stack handling
  const activeTabRef = useRef<AppTab>(activeTab);
  const returnTabRef = useRef<AppTab>(returnTab);
  const lineModalOpenRef = useRef<boolean>(isLineModalOpen);
  const overlayBackHandlerRef = useRef<(() => boolean) | null>(null);
  const lastBackPressTimeRef = useRef<number>(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    returnTabRef.current = returnTab;
  }, [returnTab]);

  useEffect(() => {
    lineModalOpenRef.current = isLineModalOpen;
  }, [isLineModalOpen]);

  // Unified mobile back-button / gesture navigation stack
  const pushHistoryLayer = useCallback((layer: string) => {
    try {
      window.history.pushState({ hgLayer: layer }, '');
    } catch {
      // Ignore in restricted environments
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (lineModalOpenRef.current) {
        setIsLineModalOpen(false);
        return;
      }
      if (overlayBackHandlerRef.current && overlayBackHandlerRef.current()) {
        return;
      }
      if (activeTabRef.current === 'theater') {
        setActiveTab(returnTabRef.current || 'discover');
        return;
      }
      if (activeTabRef.current === 'search') {
        setActiveTab('discover');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openLineModal = useCallback(() => {
    setIsLineModalOpen(true);
    pushHistoryLayer('line-modal');
  }, [pushHistoryLayer]);

  const closeLineModal = useCallback(() => {
    setIsLineModalOpen(false);
  }, []);

  const currentLineLabel = useMemo(() => {
    if (state.apiConfig.mode === 'demo' || !state.apiConfig.baseUrl) {
      return '离线库';
    }
    const targetUrl = state.apiConfig.baseUrl.trim().replace(/\/+$/, '').toLowerCase();
    const matched = [...DEFAULT_SPEED_LINES, ...DEFAULT_PERMANENT_DOMAINS].find(
      (l) => l.url.trim().replace(/\/+$/, '').toLowerCase() === targetUrl
    );
    if (matched) {
      return matched.name.split(' ')[0] || matched.name;
    }
    if (targetUrl === '/api-hg') return '本地代理';
    try {
      const u = new URL(state.apiConfig.baseUrl, window.location.origin);
      return u.hostname || '自定义';
    } catch {
      return '自定义';
    }
  }, [state.apiConfig.mode, state.apiConfig.baseUrl]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (state.apiConfig.mode === 'custom' && state.apiConfig.baseUrl.trim()) {
        setCatalogLoading(true);
      }
      const result = await loadDramaCatalog(state.apiConfig);
      if (cancelled) return;
      setDramas(result.dramas);
      setTopics(result.topics);
      setDataSource(result.source);
      setCatalogWarning(result.warning);
      setCatalogLoading(false);

      if (!result.dramas.some((d) => d.id === currentDramaId) && result.dramas[0]) {
        setCurrentDramaId(result.dramas[0].id);
        setCurrentEpisodeNumber(1);
        setResumeSeconds(0);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [state.apiConfig.mode, state.apiConfig.baseUrl]);

  const activeDrama = useMemo(
    () =>
      (currentDramaId && selectedDrama?.id === currentDramaId
        ? selectedDrama
        : dramas.find((d) => d.id === currentDramaId)) ??
      selectedDrama ??
      dramas[0] ??
      null,
    [selectedDrama, dramas, currentDramaId]
  );

  // Automatically fetch full episode list for remote dramas
  useEffect(() => {
    if (!state.apiConfig.baseUrl || state.apiConfig.mode !== 'custom') return;
    const drama = dramas.find((d) => d.id === currentDramaId);
    if (!drama) return;

    if (
      !drama.episodes ||
      drama.episodes.length <= 1 ||
      drama.episodes[0]?.title === '第 1 集'
    ) {
      fetchDramaDetail(state.apiConfig.baseUrl, currentDramaId).then((detail) => {
        if (!detail || !detail.episodes || detail.episodes.length === 0) return;
        setDramas((prev) =>
          prev.map((d) =>
            d.id === currentDramaId
              ? {
                  ...d,
                  posterUrl: detail.posterUrl || d.posterUrl,
                  heroUrl: detail.posterUrl || d.heroUrl,
                  episodes: detail.episodes.map((ep) => ({
                    ...ep,
                    posterUrl: ep.posterUrl || detail.posterUrl || d.posterUrl,
                  })),
                  totalEpisodes: detail.totalEpisodes || detail.episodes.length,
                  synopsis: detail.synopsis || d.synopsis,
                }
              : d
          )
        );
      });
    }
  }, [currentDramaId, dramas, state.apiConfig.baseUrl, state.apiConfig.mode]);

  const openTheater = useCallback(
    (drama: Drama, episodeNum?: number, startSeconds?: number) => {
      setSelectedDrama(drama);
      setDramas((prev) => (prev.some((d) => d.id === drama.id) ? prev : [drama, ...prev]));

      const saved = state.watchHistory.find((entry) => entry.dramaId === drama.id);
      const targetEp = episodeNum ?? saved?.episodeNumber ?? 1;
      const targetTime =
        startSeconds !== undefined
          ? startSeconds
          : episodeNum === undefined && saved
            ? saved.progressSeconds
            : 0;

      if (activeTabRef.current !== 'theater') {
        setReturnTab(activeTabRef.current);
        pushHistoryLayer('theater');
      }

      setCurrentDramaId(drama.id);
      setCurrentEpisodeNumber(targetEp);
      setResumeSeconds(targetTime);
      setActiveTab('theater');
      window.scrollTo({ top: 0 });
    },
    [pushHistoryLayer, state.watchHistory]
  );

  const exitTheater = useCallback(() => {
    setActiveTab(returnTabRef.current || 'discover');
    if (isNativeMedia3Available()) {
      Media3Player.setOrientation({ orientation: 'portrait' }).catch(() => null);
    }
  }, []);

  // Capacitor Android 原生硬件返回键多级优先级拦截调度
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    CapApp.addListener('backButton', () => {
      // 1. 优先关闭活动浮层（模态弹窗、底部选线/剧集抽屉）
      if (lineModalOpenRef.current) {
        setIsLineModalOpen(false);
        return;
      }
      if (overlayBackHandlerRef.current && overlayBackHandlerRef.current()) {
        return;
      }

      // 2. 剧场播放模式下返回前序浏览界面
      if (activeTabRef.current === 'theater') {
        exitTheater();
        return;
      }

      // 3. 非首页（搜索/排行榜/专题/我的）状态下返回发现主页
      if (activeTabRef.current !== 'discover') {
        setActiveTab('discover');
        return;
      }

      // 4. 处于发现主页根视图时，2秒内双击物理返回键退出应用
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTimeRef.current = now;
        showToast('再按一次退出应用');
      }
    })
      .then((handle) => {
        removeListener = () => {
          handle.remove();
        };
      })
      .catch((err) => {
        console.warn('[App] Failed to bind Capacitor backButton listener:', err);
      });

    return () => {
      removeListener?.();
    };
  }, [exitTheater, showToast]);

  // 剧场模式下全局 DOM 背景置为透明，使底层 Android 原生 Media3 (ExoPlayer) SurfaceView 完全透出
  useEffect(() => {
    if (activeTab === 'theater') {
      document.documentElement.classList.add('theater-mode');
      document.body.classList.add('theater-mode');
    } else {
      document.documentElement.classList.remove('theater-mode');
      document.body.classList.remove('theater-mode');
    }
    return () => {
      document.documentElement.classList.remove('theater-mode');
      document.body.classList.remove('theater-mode');
    };
  }, [activeTab]);

  const openSearchTab = useCallback(() => {
    if (activeTabRef.current !== 'search') {
      pushHistoryLayer('search');
    }
    setActiveTab('search');
    window.scrollTo({ top: 0 });
  }, [pushHistoryLayer]);

  const handleSelectDramaEpisode = useCallback(
    (dramaId: string, episodeNum: number, startSeconds = 0) => {
      setCurrentDramaId(dramaId);
      setCurrentEpisodeNumber(episodeNum);
      setResumeSeconds(startSeconds);
      setSelectedDrama((prev) => (prev?.id === dramaId ? prev : dramas.find((d) => d.id === dramaId) ?? prev));
    },
    [dramas]
  );

  const handleToggleFollow = useCallback(
    (dramaId: string) => {
      const added = toggleFollow(dramaId);
      showToast(added ? '已加入追剧' : '已取消追剧');
    },
    [showToast, toggleFollow]
  );

  const handleToggleLike = useCallback(
    (dramaId: string, episodeNum: number) => {
      const liked = toggleLikeEpisode(dramaId, episodeNum);
      showToast(liked ? '已点赞本集' : '已取消点赞');
    },
    [showToast, toggleLikeEpisode]
  );

  const handleSelectTag = useCallback((tag: string) => {
    setSelectedTag(tag);
    setActiveTab('discover');
    window.scrollTo({ top: 0 });
  }, []);

  const latestWatched = state.watchHistory[0];

  const handleEnterTheaterQuick = useCallback(() => {
    if (latestWatched) {
      const target = dramas.find((d) => d.id === latestWatched.dramaId) ?? activeDrama;
      if (target) {
        openTheater(target, latestWatched.episodeNumber, latestWatched.progressSeconds);
        return;
      }
    }
    if (activeDrama) {
      openTheater(activeDrama, 1, 0);
    }
  }, [activeDrama, dramas, latestWatched, openTheater]);

  return (
    <div
      className={`min-h-screen flex flex-col text-[#F8FAFC] ${
        activeTab === 'theater' ? 'bg-transparent' : 'bg-[#0B0C10]'
      }`}
    >
      {/* Desktop Top Bar */}
      <header className="hidden md:block sticky top-0 z-30 h-16 bg-[#0B0C10]/95 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto h-full px-6 lg:px-8 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setActiveTab('discover');
              setSelectedCategory('全部');
              window.scrollTo({ top: 0 });
            }}
            className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg p-1 -m-1"
          >
            <BrandLogo />
          </button>

          <nav
            aria-label="主导航"
            className="flex items-center gap-6 text-sm font-medium overflow-x-auto no-scrollbar"
          >
            {DESKTOP_NAV_ITEMS.map((item) => {
              const active =
                item.tab
                  ? item.tab === activeTab &&
                    (item.category ? (selectedCategory || '全部') === item.category : true)
                  : false;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.action === 'line') {
                      openLineModal();
                      return;
                    }
                    if (item.tab) {
                      setActiveTab(item.tab);
                    }
                    if (item.category) {
                      setSelectedCategory(item.category);
                    }
                    window.scrollTo({ top: 0 });
                  }}
                  className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 text-sm ${
                    active
                      ? 'text-amber-400 border-amber-400 font-semibold'
                      : 'text-slate-300 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openLineModal}
              className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="切换片源线路"
            >
              <Wifi className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span className="font-medium">{currentLineLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleEnterTheaterQuick}
              className="min-h-[38px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{latestWatched ? '继续刷剧' : '进入剧场'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Compact Single-Row Top Bar (Hidden in immersive Theater & dedicated Search view) */}
      {activeTab !== 'theater' && activeTab !== 'search' && (
        <header className="md:hidden sticky top-0 z-30 bg-[#0B0C10]/95 backdrop-blur-md border-b border-white/[0.06] pt-safe">
          <div className="h-[52px] px-3.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('discover');
                setSelectedCategory('全部');
                window.scrollTo({ top: 0 });
              }}
              aria-label="回到首页"
              className="shrink-0 focus-visible:outline-none"
            >
              <BrandLogo compact />
            </button>

            {/* Unified Search Trigger (No duplicate search bar inside Discover!) */}
            <button
              type="button"
              onClick={openSearchTab}
              className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#14161D] border border-white/[0.08] flex items-center gap-2 text-xs text-slate-400 active:scale-[0.99] transition-transform min-w-0"
            >
              <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate">搜短剧、漫剧、题材...</span>
            </button>

            {/* Compact Single Line Switcher */}
            <button
              type="button"
              onClick={openLineModal}
              aria-label="切换线路与测速"
              className="min-h-[36px] px-2.5 rounded-xl bg-[#14161D] border border-white/[0.08] text-slate-200 text-xs font-medium inline-flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
            >
              <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[54px]">{currentLineLabel}</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main
        className={`flex-1 ${
          activeTab === 'theater' ? 'pb-0' : 'pb-[78px] md:pb-12'
        }`}
      >
        {activeTab === 'discover' && (
          <DiscoverView
            dramas={dramas}
            topics={topics}
            followedIds={state.followedIds}
            latestWatched={latestWatched}
            loading={catalogLoading}
            warning={catalogWarning}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            selectedTag={selectedTag}
            onSelectTag={handleSelectTag}
            apiBaseUrl={
              state.apiConfig.mode === 'custom' ? state.apiConfig.baseUrl : undefined
            }
            onPlayDrama={(drama, ep, sec) => openTheater(drama, ep, sec)}
            onToggleFollow={handleToggleFollow}
            onOpenLineSelector={openLineModal}
            onPushHistoryLayer={pushHistoryLayer}
            overlayBackHandlerRef={overlayBackHandlerRef}
          />
        )}

        {activeTab === 'theater' && activeDrama && (
          <TheaterPlayer
            dramas={dramas}
            drama={activeDrama}
            episodeNumber={currentEpisodeNumber}
            initialTimeSeconds={resumeSeconds}
            followedIds={state.followedIds}
            likedEpisodeKeys={state.likedEpisodeKeys}
            preferredQuality={state.apiConfig.preferredQuality}
            apiBaseUrl={
              state.apiConfig.mode === 'custom' ? state.apiConfig.baseUrl : undefined
            }
            currentLineLabel={currentLineLabel}
            onExitTheater={exitTheater}
            onPushHistoryLayer={pushHistoryLayer}
            overlayBackHandlerRef={overlayBackHandlerRef}
            onChangeQuality={(quality) => updateApiConfig({ preferredQuality: quality })}
            onSelectDramaEpisode={handleSelectDramaEpisode}
            onSelectTag={handleSelectTag}
            onToggleFollow={handleToggleFollow}
            onToggleLike={handleToggleLike}
            onRecordProgress={recordProgress}
            onNotify={showToast}
            onOpenLineSelector={openLineModal}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            dramas={dramas}
            searchHistory={state.searchHistory}
            apiBaseUrl={
              state.apiConfig.mode === 'custom' ? state.apiConfig.baseUrl : undefined
            }
            onBack={() => setActiveTab('discover')}
            onAddSearchTerm={addSearchTerm}
            onRemoveSearchTerm={removeSearchTerm}
            onClearSearchHistory={clearSearchHistory}
            onPlayDrama={(drama) => openTheater(drama)}
            onSelectTag={handleSelectTag}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            dramas={dramas}
            followedIds={state.followedIds}
            watchHistory={state.watchHistory}
            apiConfig={state.apiConfig}
            activeDataSource={dataSource}
            currentLineLabel={currentLineLabel}
            onPlayDrama={(drama, ep, sec) => openTheater(drama, ep, sec)}
            onToggleFollow={handleToggleFollow}
            onRemoveHistoryItem={removeHistoryItem}
            onClearHistory={clearHistory}
            onUpdateApiConfig={updateApiConfig}
            onNotify={showToast}
            onOpenLineSelector={openLineModal}
          />
        )}
      </main>

      {/* Quiet Desktop Footer */}
      {activeTab !== 'theater' && (
        <footer className="hidden md:block border-t border-white/[0.06] mt-auto">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-500">
            <span className="font-display font-semibold text-slate-300">
              黄果短剧
            </span>
            <span>短剧 · 漫剧 · AI换脸 · AI魔改 · 支持自定义片源接入</span>
          </div>
        </footer>
      )}

      {/* Mobile Fixed 4-Tab Bottom Navigation Bar (Auto-hidden in immersive Theater for full 100dvh video!) */}
      {activeTab !== 'theater' && (
        <nav
          aria-label="底部导航"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0C10]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
        >
          <div className="grid grid-cols-4 h-[60px] items-center">
            {MOBILE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'theater') {
                      handleEnterTheaterQuick();
                      return;
                    }
                    if (item.id === 'search') {
                      openSearchTab();
                      return;
                    }
                    setActiveTab(item.id);
                    window.scrollTo({ top: 0 });
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all ${
                    active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className="w-[21px] h-[21px]"
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium tracking-tight">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Action Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#1D202A]/95 border border-white/15 text-xs sm:text-sm font-medium text-white shadow-xl backdrop-blur-md whitespace-nowrap pointer-events-none ${
            activeTab === 'theater'
              ? 'top-[calc(env(safe-area-inset-top,0px)+64px)]'
              : 'bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] md:bottom-8'
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Line Selector Bottom Sheet / Modal */}
      <LineSelectorModal
        isOpen={isLineModalOpen}
        onClose={closeLineModal}
        currentBaseUrl={state.apiConfig.mode === 'custom' ? state.apiConfig.baseUrl : ''}
        onSelectLine={(url) => {
          if (!url) {
            updateApiConfig({ mode: 'demo', baseUrl: '' });
          } else {
            updateApiConfig({ mode: 'custom', baseUrl: url });
          }
        }}
        onNotify={showToast}
      />
    </div>
  );
}
