import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clapperboard, Compass, Play, Search, User } from 'lucide-react';
import { DiscoverView } from './components/DiscoverView';
import { ProfileView } from './components/ProfileView';
import { SearchView } from './components/SearchView';
import { TheaterPlayer } from './components/TheaterPlayer';
import { DEMO_DRAMAS, DEMO_TOPICS } from './data/demoCatalog';
import { useUserLibrary } from './hooks/useUserLibrary';
import { loadDramaCatalog } from './services/dramaApi';
import type { AppTab, Drama, Topic } from './types/drama';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Compass }[] = [
  { id: 'discover', label: '发现', icon: Compass },
  { id: 'theater', label: '剧场', icon: Clapperboard },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'profile', label: '我的', icon: User },
];

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
  const [dramas, setDramas] = useState<Drama[]>(DEMO_DRAMAS);
  const [topics, setTopics] = useState<Topic[]>(DEMO_TOPICS);
  const [dataSource, setDataSource] = useState<'demo' | 'custom'>('demo');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState<string | undefined>();

  const [currentDramaId, setCurrentDramaId] = useState<string>(
    state.watchHistory[0]?.dramaId ?? DEMO_DRAMAS[0].id
  );
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number>(
    state.watchHistory[0]?.episodeNumber ?? 1
  );
  const [resumeSeconds, setResumeSeconds] = useState<number>(
    state.watchHistory[0]?.progressSeconds ?? 0
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2400);
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
    () => dramas.find((d) => d.id === currentDramaId) ?? dramas[0] ?? DEMO_DRAMAS[0],
    [dramas, currentDramaId]
  );

  const openTheater = useCallback(
    (drama: Drama, episodeNum?: number, startSeconds?: number) => {
      const saved = state.watchHistory.find((entry) => entry.dramaId === drama.id);
      const targetEp = episodeNum ?? saved?.episodeNumber ?? 1;
      const targetTime =
        startSeconds !== undefined
          ? startSeconds
          : episodeNum === undefined && saved
            ? saved.progressSeconds
            : 0;

      setCurrentDramaId(drama.id);
      setCurrentEpisodeNumber(targetEp);
      setResumeSeconds(targetTime);
      setActiveTab('theater');
      window.scrollTo({ top: 0 });
    },
    [state.watchHistory]
  );

  const handleSelectDramaEpisode = useCallback(
    (dramaId: string, episodeNum: number, startSeconds = 0) => {
      setCurrentDramaId(dramaId);
      setCurrentEpisodeNumber(episodeNum);
      setResumeSeconds(startSeconds);
    },
    []
  );

  const handleToggleFollow = useCallback(
    (dramaId: string) => {
      const added = toggleFollow(dramaId);
      showToast(added ? '已加入追剧列表' : '已取消追剧');
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

  const latestWatched = state.watchHistory[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0C10] text-[#F8FAFC]">
      {/* Desktop 3-Zone Top Bar Contract */}
      <header className="hidden md:block sticky top-0 z-30 h-16 bg-[#0B0C10]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto h-full px-6 lg:px-8 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className="font-display text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm"
          >
            黄果短剧
          </button>

          <nav
            aria-label="主导航"
            className="flex items-center gap-8 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    window.scrollTo({ top: 0 });
                  }}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
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

          <button
            type="button"
            onClick={() => {
              if (latestWatched) {
                const target = dramas.find((d) => d.id === latestWatched.dramaId) ?? activeDrama;
                openTheater(target, latestWatched.episodeNumber, latestWatched.progressSeconds);
              } else {
                openTheater(activeDrama, 1, 0);
              }
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>{latestWatched ? '继续刷剧' : '进入剧场'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Compact Header (hidden in immersive Theater mode for maximum video height) */}
      {activeTab !== 'theater' && (
        <header className="md:hidden sticky top-0 z-30 h-[52px] px-4 bg-[#0B0C10]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            黄果短剧
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            aria-label="打开搜索"
            className="min-h-[44px] min-w-[44px] flex items-center justify-end text-slate-300 hover:text-amber-400"
          >
            <Search className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>
      )}

      {/* Main Content Area */}
      <main
        className={`flex-1 ${
          activeTab === 'theater' ? 'pb-16 md:pb-0' : 'pb-24 md:pb-12'
        }`}
      >
        {activeTab === 'discover' && (
          <DiscoverView
            dramas={dramas}
            topics={topics}
            followedIds={state.followedIds}
            loading={catalogLoading}
            warning={catalogWarning}
            onPlayDrama={(drama, ep) => openTheater(drama, ep)}
            onToggleFollow={handleToggleFollow}
            onOpenSearch={() => setActiveTab('search')}
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
            onChangeQuality={(quality) => updateApiConfig({ preferredQuality: quality })}
            onSelectDramaEpisode={handleSelectDramaEpisode}
            onToggleFollow={handleToggleFollow}
            onToggleLike={handleToggleLike}
            onRecordProgress={recordProgress}
            onNotify={showToast}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            dramas={dramas}
            searchHistory={state.searchHistory}
            onAddSearchTerm={addSearchTerm}
            onRemoveSearchTerm={removeSearchTerm}
            onClearSearchHistory={clearSearchHistory}
            onPlayDrama={(drama) => openTheater(drama)}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            dramas={dramas}
            followedIds={state.followedIds}
            watchHistory={state.watchHistory}
            apiConfig={state.apiConfig}
            activeDataSource={dataSource}
            onPlayDrama={(drama, ep, sec) => openTheater(drama, ep, sec)}
            onToggleFollow={handleToggleFollow}
            onRemoveHistoryItem={removeHistoryItem}
            onClearHistory={clearHistory}
            onUpdateApiConfig={updateApiConfig}
            onNotify={showToast}
          />
        )}
      </main>

      {/* Quiet Desktop Footer (hidden on immersive Theater) */}
      {activeTab !== 'theater' && (
        <footer className="hidden md:block border-t border-white/[0.06] mt-auto">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-500">
            <span className="font-display font-semibold text-slate-300">
              黄果短剧
            </span>
            <span>AI短剧 · 原创短剧 · AI漫剧 · 支持自定义片源 API 接入</span>
          </div>
        </footer>
      )}

      {/* Mobile Fixed 4-Tab Bottom Navigation Bar */}
      <nav
        aria-label="底部导航"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0C10]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  window.scrollTo({ top: 0 });
                }}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
                <span className="text-[11px] font-medium tracking-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Lightweight Action Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-8 z-50 px-4 py-2.5 rounded-2xl bg-[#1D202A]/95 border border-white/15 text-xs sm:text-sm font-medium text-white shadow-xl backdrop-blur-md whitespace-nowrap"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
