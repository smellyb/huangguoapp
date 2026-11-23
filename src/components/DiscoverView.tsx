import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Flame,
  Play,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { deriveRankings } from '../services/dramaApi';
import {
  POPULAR_TAGS,
  type Drama,
  type RankingType,
  type Topic,
  type WatchHistoryEntry,
} from '../types/drama';
import { DramaCoverImage, DramaPoster } from './DramaPoster';

interface DiscoverViewProps {
  dramas: Drama[];
  topics: Topic[];
  followedIds?: string[];
  latestWatched?: WatchHistoryEntry;
  loading: boolean;
  warning?: string;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  onPlayDrama: (drama: Drama, episodeNumber?: number, startSeconds?: number) => void;
  onToggleFollow?: (dramaId: string) => void;
  onOpenLineSelector?: () => void;
  onPushHistoryLayer?: (layer: string) => void;
  overlayBackHandlerRef?: MutableRefObject<(() => boolean) | null>;
}

const CHANNEL_TABS = [
  { id: '全部', label: '推荐' },
  { id: '黄果原创', label: '黄果原创' },
  { id: '短剧', label: '短剧' },
  { id: '漫剧', label: '漫剧' },
  { id: 'AI换脸', label: 'AI换脸' },
  { id: 'AI魔改', label: 'AI魔改' },
  { id: '排行榜', label: '排行榜' },
  { id: '专题', label: '专题' },
] as const;

const SORT_OPTIONS = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热播' },
  { key: 'recommended', label: '精选' },
] as const;

export function DiscoverView({
  dramas,
  topics,
  followedIds: _followedIds,
  latestWatched,
  loading,
  warning,
  selectedCategory,
  onSelectCategory,
  onPlayDrama,
  onToggleFollow: _onToggleFollow,
  onOpenLineSelector,
  onPushHistoryLayer,
  overlayBackHandlerRef,
}: DiscoverViewProps) {
  const [activeChannel, setActiveChannel] = useState<string>(selectedCategory || '全部');
  const [selectedGenre, setSelectedGenre] = useState<string>('全部');
  const [sortMode, setSortMode] = useState<'latest' | 'hot' | 'recommended'>('latest');
  const [rankingTab, setRankingTab] = useState<RankingType>('hot');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [showGenreSheet, setShowGenreSheet] = useState(false);

  useEffect(() => {
    if (!overlayBackHandlerRef) return;
    overlayBackHandlerRef.current = () => {
      if (showGenreSheet) {
        setShowGenreSheet(false);
        return true;
      }
      if (selectedTopic) {
        setSelectedTopic(null);
        return true;
      }
      return false;
    };
    return () => {
      overlayBackHandlerRef.current = null;
    };
  }, [overlayBackHandlerRef, selectedTopic, showGenreSheet]);

  useEffect(() => {
    if (selectedCategory && selectedCategory !== activeChannel) {
      setActiveChannel(selectedCategory);
      setSelectedTopic(null);
      if (selectedCategory === '全部') {
        setSelectedGenre('全部');
      }
    }
  }, [selectedCategory, activeChannel]);

  const handleSelectChannel = (channel: string) => {
    setActiveChannel(channel);
    setSelectedTopic(null);
    setSelectedGenre('全部');
    onSelectCategory?.(channel);
  };

  const resumeDrama = useMemo(() => {
    if (!latestWatched) return null;
    const drama = dramas.find((d) => d.id === latestWatched.dramaId);
    if (!drama) return null;
    const pct = Math.min(
      100,
      Math.round(
        (latestWatched.progressSeconds / Math.max(latestWatched.durationSeconds, 1)) * 100
      )
    );
    return { drama, entry: latestWatched, pct };
  }, [dramas, latestWatched]);

  const filteredDramas = useMemo(() => {
    if (selectedTopic) {
      const idSet = new Set(selectedTopic.dramaIds);
      const matched = dramas.filter((d) => idSet.has(d.id));
      return matched.length > 0 ? matched : dramas;
    }

    let list = dramas;

    if (
      activeChannel !== '全部' &&
      activeChannel !== '排行榜' &&
      activeChannel !== '专题'
    ) {
      if (activeChannel === '黄果原创') {
        const originals = list.filter(
          (d) =>
            d.isFeatured ||
            d.studio.includes('黄果') ||
            d.category === '短剧'
        );
        list = originals.length > 0 ? originals : list;
      } else {
        list = list.filter(
          (d) =>
            d.category === activeChannel ||
            d.genres.some((genre) => genre === activeChannel) ||
            d.tagline.includes(activeChannel)
        );
      }
    }

    if (selectedGenre !== '全部') {
      list = list.filter(
        (d) =>
          d.genres.some((genre) => genre === selectedGenre) ||
          d.category === selectedGenre ||
          d.tagline.includes(selectedGenre) ||
          d.synopsis.includes(selectedGenre)
      );
    }

    return list;
  }, [dramas, activeChannel, selectedGenre, selectedTopic]);

  const sortedDramas = useMemo(() => {
    const list = [...filteredDramas];
    if (sortMode === 'hot') {
      list.sort((a, b) => b.heatScore - a.heatScore);
    } else if (sortMode === 'recommended') {
      list.sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return b.heatScore - a.heatScore;
      });
    }
    return list;
  }, [filteredDramas, sortMode]);

  const rankedDramas = useMemo(
    () => deriveRankings(dramas, rankingTab).slice(0, 10),
    [dramas, rankingTab]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-16 rounded-xl bg-[#14161D] animate-pulse shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[3/4] rounded-2xl bg-[#14161D] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[#14161D] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isRankingOnlyView = !selectedTopic && activeChannel === '排行榜';
  const isTopicsOnlyView = !selectedTopic && activeChannel === '专题';

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-2 sm:pt-6 pb-4 space-y-5 sm:space-y-10">
      {/* Warning / Fallback Banner */}
      {warning && (
        <div
          role="status"
          className="rounded-2xl bg-[#14161D] border border-amber-500/30 px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm text-amber-200"
        >
          <span className="leading-snug">{warning}</span>
          {onOpenLineSelector && (
            <button
              type="button"
              onClick={onOpenLineSelector}
              className="min-h-[36px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] font-semibold text-xs whitespace-nowrap shrink-0 active:scale-95 transition-transform"
            >
              切换线路
            </button>
          )}
        </div>
      )}

      {/* Mobile & Tablet Primary Channel Tabs (replaces desktop-only nav on phones) */}
      {!selectedTopic && (
        <nav
          aria-label="剧集频道"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-white/[0.06] -mx-3.5 px-3.5 sm:mx-0 sm:px-0"
        >
          {CHANNEL_TABS.map((ch) => {
            const active = activeChannel === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectChannel(ch.id)}
                className={`relative min-h-[44px] px-3 text-sm transition-colors whitespace-nowrap shrink-0 flex items-center justify-center ${
                  active
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <span>{ch.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-amber-400"
                  />
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Quick Continue Watching Card (Prime thumb-accessible resume on Home) */}
      {!selectedTopic && resumeDrama && activeChannel === '全部' && (
        <section aria-label="继续观看">
          <button
            type="button"
            onClick={() =>
              onPlayDrama(
                resumeDrama.drama,
                resumeDrama.entry.episodeNumber,
                resumeDrama.entry.progressSeconds
              )
            }
            className="w-full text-left rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/35 p-3 flex items-center gap-3 active:scale-[0.99] transition-all"
          >
            <div className="relative w-11 aspect-[3/4] rounded-xl overflow-hidden bg-[#1D202A] shrink-0">
              <DramaCoverImage
                src={resumeDrama.drama.posterUrl}
                alt={resumeDrama.drama.title}
                title={resumeDrama.drama.title}
                category={resumeDrama.drama.category}
                compact
                className="h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>继续观看</span>
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {resumeDrama.drama.title}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                <span>第 {resumeDrama.entry.episodeNumber} 集</span>
                <span aria-hidden="true">·</span>
                <span>已看 {resumeDrama.pct}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden max-w-[200px]">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${resumeDrama.pct}%` }}
                />
              </div>
            </div>

            <span className="min-h-[38px] px-3.5 rounded-xl bg-amber-500 text-[#0B0C10] text-xs font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>续播</span>
            </span>
          </button>
        </section>
      )}

      {/* Topic Drill-Down Header */}
      {selectedTopic && (
        <section className="rounded-2xl bg-[#14161D] border border-white/[0.08] p-4 sm:p-6 space-y-3">
          <button
            type="button"
            onClick={() => setSelectedTopic(null)}
            className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 px-1 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>返回</span>
          </button>

          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs text-slate-400">
              专题合集 <span aria-hidden="true">·</span> {selectedTopic.accentNote}
            </p>
            <h1
              className="text-xl sm:text-3xl font-bold tracking-tight text-white"
              style={{ textWrap: 'balance' }}
            >
              {selectedTopic.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {selectedTopic.subtitle}
            </p>
          </div>
        </section>
      )}

      {/* Sort & Genre Filter Toolbar (shown on drama feed views) */}
      {!selectedTopic && !isRankingOnlyView && !isTopicsOnlyView && (
        <section aria-label="排序与题材筛选" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            {/* Compact Sort Segmented Control */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#14161D] border border-white/[0.08]">
              {SORT_OPTIONS.map((opt) => {
                const active = sortMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSortMode(opt.key)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-amber-500 text-[#0B0C10]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* All Genres Sheet Trigger */}
            <button
              type="button"
              onClick={() => {
                setShowGenreSheet(true);
                onPushHistoryLayer?.('genre-sheet');
              }}
              className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 active:scale-95 ${
                selectedGenre !== '全部'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#14161D] border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{selectedGenre !== '全部' ? `题材：${selectedGenre}` : '筛选题材'}</span>
            </button>
          </div>

          {/* Fast Horizontal Genre Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
            {POPULAR_TAGS.slice(0, 12).map((tag) => {
              const active = selectedGenre === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedGenre(tag)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-[#0B0C10] font-semibold'
                      : 'bg-[#14161D] text-slate-300 hover:text-white hover:bg-[#1D202A]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Drama Poster Grid */}
      {!isRankingOnlyView && !isTopicsOnlyView && (
        <section aria-label="剧集列表" className="space-y-3">
          {sortedDramas.length === 0 ? (
            <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] py-12 px-6 text-center space-y-3">
              <p className="text-sm font-medium text-slate-200">
                当前筛选条件下暂无剧集
              </p>
              <button
                type="button"
                onClick={() => {
                  handleSelectChannel('全部');
                  setSelectedGenre('全部');
                }}
                className="min-h-[44px] px-5 rounded-xl bg-amber-500 text-[#0B0C10] text-sm font-semibold hover:bg-amber-400 transition-colors"
              >
                查看全部剧集
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
              {sortedDramas.map((drama) => (
                <DramaPoster
                  key={drama.id}
                  drama={drama}
                  onSelect={(item) => onPlayDrama(item)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Top Rankings Section */}
      {!selectedTopic && !isTopicsOnlyView && (
        <section aria-label="热播排行榜" className="space-y-4 pt-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-white">热播排行榜</h2>

            <div
              role="tablist"
              aria-label="排行榜分类"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#14161D] border border-white/[0.08]"
            >
              {(
                [
                  { key: 'hot', label: '热播榜' },
                  { key: 'new', label: '新剧榜' },
                  { key: 'comic', label: '漫剧榜' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={rankingTab === tab.key}
                  onClick={() => setRankingTab(tab.key)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    rankingTab === tab.key
                      ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(isRankingOnlyView ? rankedDramas : rankedDramas.slice(0, 6)).map(
              (drama, index) => {
                const rankNumber = String(index + 1).padStart(2, '0');
                const isTopThree = index < 3;
                return (
                  <button
                    key={drama.id}
                    type="button"
                    onClick={() => onPlayDrama(drama)}
                    className="group w-full text-left flex items-center gap-3.5 p-3 rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/40 active:scale-[0.99] transition-all"
                  >
                    <span
                      className={`font-mono text-xl font-bold tabular-nums w-8 text-center shrink-0 ${
                        isTopThree ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {rankNumber}
                    </span>

                    <div className="w-14 aspect-[3/4] rounded-xl overflow-hidden bg-[#1D202A] shrink-0">
                      <DramaCoverImage
                        src={drama.posterUrl}
                        alt={drama.title}
                        fallbackId={drama.id}
                        title={drama.title}
                        category={drama.category}
                        compact
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-amber-400 transition-colors truncate">
                        {drama.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {drama.tagline}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-0.5 text-amber-300">
                          <Flame className="w-3 h-3" aria-hidden="true" />
                          {drama.heatScore}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{drama.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {drama.status === '已完结'
                            ? `全${drama.totalEpisodes}集`
                            : `更至${drama.updatedEpisodes}集`}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                );
              }
            )}
          </div>
        </section>
      )}

      {/* Curated Topics Section */}
      {!selectedTopic && !isRankingOnlyView && topics.length > 0 && (
        <section aria-label="专题推荐" className="space-y-4 pt-2">
          <h2 className="text-lg sm:text-xl font-bold text-white">专题推荐</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
            {topics.map((topic, idx) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => {
                  setSelectedTopic(topic);
                  onPushHistoryLayer?.('topic-detail');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl text-left border border-white/[0.08] hover:border-amber-500/40 active:scale-[0.99] transition-all min-h-[168px] sm:min-h-[210px] flex items-end ${
                  idx === 0 ? 'md:col-span-2' : ''
                }`}
              >
                <DramaCoverImage
                  src={topic.coverUrl}
                  alt={topic.title}
                  fallbackId={topic.id}
                  title={topic.title}
                  compact
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10]/95 via-[#0B0C10]/55 to-black/15" />

                <div className="relative z-10 p-4 sm:p-6 space-y-1 max-w-xl">
                  <p className="text-xs text-amber-300 font-medium">
                    {topic.accentNote}
                  </p>
                  <h3 className="text-base sm:text-xl font-bold text-white group-hover:text-amber-300 transition-colors">
                    {topic.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 line-clamp-2">
                    {topic.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All Genres Bottom Sheet (Thumb-friendly genre picker) */}
      {showGenreSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="选择题材"
          onClick={() => setShowGenreSheet(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#14161D] border-t sm:border border-white/10 p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] space-y-4 shadow-2xl"
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">选择剧集题材</h3>
              <button
                type="button"
                onClick={() => setShowGenreSheet(false)}
                aria-label="关闭题材筛选"
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 max-h-[55dvh] overflow-y-auto no-scrollbar">
              {POPULAR_TAGS.map((tag) => {
                const active = selectedGenre === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedGenre(tag);
                      setShowGenreSheet(false);
                    }}
                    className={`min-h-[42px] px-2 rounded-xl text-xs font-medium transition-colors truncate ${
                      active
                        ? 'bg-amber-500 text-[#0B0C10] font-bold'
                        : 'bg-[#1D202A] text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
