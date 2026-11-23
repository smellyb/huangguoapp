import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Flame,
  Play,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import {
  deriveHomeSections,
  deriveRankings,
  fetchChannelDramas,
  fetchDramasByTag,
  fetchHomeSections,
  fetchOfficialTags,
  type HomeSectionsData,
} from '../services/dramaApi';
import {
  POPULAR_TAGS,
  type Drama,
  type OfficialTagCategory,
  type RankingType,
  type Topic,
  type WatchHistoryEntry,
} from '../types/drama';
import OFFICIAL_TAGS_DATA from '../data/officialTags.json';
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
  selectedTag?: string;
  onSelectTag?: (tag: string) => void;
  onPlayDrama: (drama: Drama, episodeNumber?: number, startSeconds?: number) => void;
  onToggleFollow?: (dramaId: string) => void;
  onOpenLineSelector?: () => void;
  onPushHistoryLayer?: (layer: string) => void;
  overlayBackHandlerRef?: MutableRefObject<(() => boolean) | null>;
  apiBaseUrl?: string;
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
  selectedTag,
  onSelectTag,
  onPlayDrama,
  onToggleFollow: _onToggleFollow,
  onOpenLineSelector,
  onPushHistoryLayer,
  overlayBackHandlerRef,
  apiBaseUrl,
}: DiscoverViewProps) {
  const [activeChannel, setActiveChannel] = useState<string>(selectedCategory || '全部');
  const [selectedGenre, setSelectedGenre] = useState<string>(selectedTag || '全部');
  const [tagRemoteDramas, setTagRemoteDramas] = useState<Drama[]>([]);
  const [tagTotalCount, setTagTotalCount] = useState<number | undefined>();
  const [tagIntro, setTagIntro] = useState<string | undefined>();
  const [isTagLoading, setIsTagLoading] = useState(false);
  const [sortMode, setSortMode] = useState<'latest' | 'hot' | 'recommended'>('latest');
  const [rankingTab, setRankingTab] = useState<RankingType>('hot');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [showGenreSheet, setShowGenreSheet] = useState(false);
  const [channelSubFilter, setChannelSubFilter] = useState<'latest' | 'hot' | 'recommended' | 'all' | 'manju' | 'duanju'>('latest');

  // Live Homepage Sections parsed from https://huangguoai.com/
  const [liveHomeSections, setLiveHomeSections] = useState<HomeSectionsData | null>(null);

  // Channel remote pagination (1879+ dramas: 短剧 1758+, 漫剧 121+, 原创 268+)
  const [channelRemoteDramas, setChannelRemoteDramas] = useState<Drama[]>([]);
  const [channelTotalCount, setChannelTotalCount] = useState<number | undefined>();
  const [channelPage, setChannelPage] = useState(1);
  const [channelHasMore, setChannelHasMore] = useState(false);
  const [isChannelLoading, setIsChannelLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Official 9-Category Tags from huangguoai.com
  const [tagCategories, setTagCategories] = useState<OfficialTagCategory[]>(() => OFFICIAL_TAGS_DATA as OfficialTagCategory[]);
  const [activeTagCategoryCode, setActiveTagCategoryCode] = useState<string>('all');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const tagScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOfficialTags().then((cats) => {
      if (Array.isArray(cats) && cats.length > 0) {
        setTagCategories(cats);
      }
    });
  }, []);

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

  useEffect(() => {
    if (selectedTag && selectedTag !== selectedGenre) {
      setSelectedGenre(selectedTag);
    }
  }, [selectedTag, selectedGenre]);

  const handleSelectGenre = (tag: string) => {
    const next = selectedGenre === tag ? '全部' : tag;
    setSelectedGenre(next);
    onSelectTag?.(next);
  };

  // Dynamically load real dramas from huangguoai.com for selected tag
  useEffect(() => {
    if (selectedGenre === '全部') {
      setTagRemoteDramas([]);
      setTagTotalCount(undefined);
      setTagIntro(undefined);
      setIsTagLoading(false);
      return;
    }

    let active = true;
    setIsTagLoading(true);

    fetchDramasByTag(apiBaseUrl || '', selectedGenre)
      .then((res) => {
        if (!active) return;
        if (res && res.dramas.length > 0) {
          setTagRemoteDramas(res.dramas);
          setTagTotalCount(res.totalCount);
          setTagIntro(res.intro);
        } else {
          setTagRemoteDramas([]);
          setTagTotalCount(undefined);
          setTagIntro(undefined);
        }
      })
      .catch(() => {
        if (active) {
          setTagRemoteDramas([]);
        }
      })
      .finally(() => {
        if (active) {
          setIsTagLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, selectedGenre]);

  // Fetch live homepage sections from huangguoai.com HTML
  useEffect(() => {
    let active = true;
    fetchHomeSections(apiBaseUrl, dramas, topics).then((sections) => {
      if (active && sections) {
        setLiveHomeSections(sections);
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, dramas, topics]);

  // Fetch remote channel dramas with pagination when browsing a channel
  useEffect(() => {
    if (activeChannel === '全部' || activeChannel === '专题' || selectedGenre !== '全部') {
      setChannelRemoteDramas([]);
      setChannelTotalCount(undefined);
      setChannelPage(1);
      setChannelHasMore(false);
      setIsChannelLoading(false);
      return;
    }

    let active = true;
    setIsChannelLoading(true);
    setChannelPage(1);

    fetchChannelDramas(
      apiBaseUrl || '',
      activeChannel,
      1,
      sortMode === 'hot' ? 'hot' : 'new',
      24
    )
      .then((res) => {
        if (!active) return;
        setChannelRemoteDramas(res.dramas);
        setChannelTotalCount(res.total);
        setChannelPage(1);
        setChannelHasMore(res.hasMore);
      })
      .catch((err) => {
        console.warn(`[DiscoverView] Failed to fetch channel dramas:`, err);
      })
      .finally(() => {
        if (active) {
          setIsChannelLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeChannel, sortMode, apiBaseUrl, selectedGenre]);

  const handleLoadMoreChannel = () => {
    if (isLoadingMore || !channelHasMore) return;
    setIsLoadingMore(true);
    const nextPage = channelPage + 1;

    fetchChannelDramas(
      apiBaseUrl || '',
      activeChannel,
      nextPage,
      sortMode === 'hot' ? 'hot' : 'new',
      24
    )
      .then((res) => {
        setChannelRemoteDramas((prev) => [...prev, ...res.dramas]);
        setChannelTotalCount(res.total);
        setChannelPage(nextPage);
        setChannelHasMore(res.hasMore);
      })
      .catch((err) => {
        console.warn(`[DiscoverView] Failed to load more channel dramas:`, err);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  };

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

    if (selectedGenre !== '全部') {
      if (tagRemoteDramas.length > 0) {
        return tagRemoteDramas;
      }
      const target = selectedGenre.toLowerCase();
      return dramas.filter(
        (d) =>
          d.genres.some((genre) => genre.toLowerCase() === target) ||
          d.category.toLowerCase() === target ||
          d.title.toLowerCase().includes(target) ||
          d.tagline.toLowerCase().includes(target) ||
          d.synopsis.toLowerCase().includes(target)
      );
    }

    if (
      activeChannel !== '全部' &&
      activeChannel !== '排行榜' &&
      activeChannel !== '专题'
    ) {
      if (channelRemoteDramas.length > 0) {
        return channelRemoteDramas;
      }
      let list = dramas;
      if (activeChannel === '黄果原创') {
        let originals = list.filter(
          (d) =>
            d.isFeatured ||
            d.studio.includes('黄果') ||
            d.category === '短剧' ||
            d.category === '漫剧' ||
            d.category === '黄果原创'
        );
        if (channelSubFilter === 'manju') {
          originals = originals.filter((d) => d.category === '漫剧');
        } else if (channelSubFilter === 'duanju') {
          originals = originals.filter((d) => d.category === '短剧');
        }
        return originals.length > 0 ? originals : list;
      } else if (activeChannel === '短剧') {
        list = list.filter((d) => d.category === '短剧' || d.category === '全部');
        if (channelSubFilter === 'recommended') {
          list = list.filter((d) => Boolean(d.isFeatured || (d.rating && d.rating >= 9.5)));
        }
        return list;
      } else if (activeChannel === '漫剧') {
        list = list.filter((d) => d.category === '漫剧');
        if (channelSubFilter === 'recommended') {
          list = list.filter((d) => Boolean(d.isFeatured || (d.rating && d.rating >= 9.5)));
        }
        return list;
      } else {
        return list.filter(
          (d) =>
            d.category === activeChannel ||
            d.genres.some((genre) => genre.toLowerCase() === activeChannel.toLowerCase()) ||
            d.title.includes(activeChannel) ||
            d.tagline.includes(activeChannel)
        );
      }
    }

    return dramas;
  }, [dramas, activeChannel, channelSubFilter, selectedGenre, selectedTopic, tagRemoteDramas, channelRemoteDramas]);

  const sortedDramas = useMemo(() => {
    if (channelRemoteDramas.length > 0 && selectedGenre === '全部') {
      return channelRemoteDramas;
    }
    const list = [...filteredDramas];
    const effectiveSort =
      activeChannel !== '全部' && (channelSubFilter === 'hot' || channelSubFilter === 'recommended' || channelSubFilter === 'latest')
        ? channelSubFilter
        : sortMode;

    if (effectiveSort === 'hot') {
      list.sort((a, b) => b.heatScore - a.heatScore);
    } else if (effectiveSort === 'recommended') {
      list.sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return b.heatScore - a.heatScore;
      });
    }
    return list;
  }, [channelRemoteDramas, selectedGenre, filteredDramas, sortMode, activeChannel, channelSubFilter]);

  const rankedDramas = useMemo(
    () => deriveRankings(dramas, rankingTab).slice(0, 10),
    [dramas, rankingTab]
  );

  const homeSections = useMemo(
    () => liveHomeSections || deriveHomeSections(dramas, topics),
    [liveHomeSections, dramas, topics]
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
  const isHomePage =
    activeChannel === '全部' && selectedGenre === '全部' && !selectedTopic;

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

      {/* Channel Header (Matches huangguoai.com channel page subheaders) */}
      {!selectedTopic && (activeChannel === '短剧' || activeChannel === '漫剧' || activeChannel === '黄果原创') && (
        <section className="space-y-3 pt-1 pb-2 border-b border-white/[0.08]">
          <div className="text-xs text-slate-400 font-medium">
            <span className="text-slate-500">首页</span> /{' '}
            <span className="text-amber-400">
              {activeChannel === '短剧'
                ? 'AI成人短剧'
                : activeChannel === '漫剧'
                ? 'AI成人漫剧'
                : '黄果原创'}
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-base sm:text-xl font-bold text-white leading-snug">
              {activeChannel === '短剧' && 'AI成人短剧'}
              {activeChannel === '漫剧' && 'AI成人漫剧'}
              {activeChannel === '黄果原创' && '黄果独家原创'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              {activeChannel === '短剧' && '精选热播短剧，汇集独家原创、精选推荐与最新更新内容。'}
              {activeChannel === '漫剧' && '精选热播漫剧，汇集独家原创、精选推荐与最新更新内容。'}
              {activeChannel === '黄果原创' && '黄果自研高画质短剧与漫剧在线观看。'}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 overflow-x-auto no-scrollbar">
            {(activeChannel === '黄果原创'
              ? [
                  { id: 'all', label: '全部原创' },
                  { id: 'manju', label: '原创漫剧' },
                  { id: 'duanju', label: '原创短剧' },
                ]
              : [
                  { id: 'latest', label: '最近更新' },
                  { id: 'hot', label: '当前热播' },
                  { id: 'recommended', label: '精选推荐' },
                ]
            ).map((p) => {
              const active = channelSubFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setChannelSubFilter(p.id as any)}
                  className={`min-h-[34px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-amber-400 text-[#0B0C10] shadow-md shadow-amber-500/20'
                      : 'bg-[#14161D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#1D202A]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Official Popular Tags Row & Filter Bar (huangguoai.com 热门标签完全对齐) */}
      {!selectedTopic && !isRankingOnlyView && !isTopicsOnlyView && (
        <section aria-label="热门标签与题材筛选" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-1 h-3.5 rounded-full bg-[#ffd21c]" />
              <h2 className="text-sm font-bold text-white tracking-wide">热门标签</h2>
              {selectedGenre !== '全部' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ffd21c]/15 text-[#ffd21c] border border-[#ffd21c]/30">
                  当前：{selectedGenre}
                  <button
                    type="button"
                    onClick={() => handleSelectGenre('全部')}
                    aria-label="清除筛选"
                    className="hover:text-white ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            {/* All Genres Sheet Trigger */}
            <button
              type="button"
              onClick={() => {
                setShowGenreSheet(true);
                onPushHistoryLayer?.('genre-sheet');
              }}
              className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 active:scale-95 ${
                selectedGenre !== '全部'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#14161D] border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>全部分类标签 (9大类)</span>
            </button>
          </div>

          {/* 20 Official Popular Tags Strip with exact huangguoai.com gradient pills & fade overlays */}
          <div className="relative group">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-[#0B0C10] to-transparent z-10" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-[#0B0C10] to-transparent z-10" />

            <div
              ref={tagScrollRef}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth -mx-3.5 px-3.5 sm:mx-0 sm:px-0 py-1"
            >
              {POPULAR_TAGS.map((tag) => {
                const active = selectedGenre === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleSelectGenre(tag)}
                    className={`h-8 px-4 rounded-full text-xs sm:text-[13px] font-medium whitespace-nowrap shrink-0 transition-all active:scale-95 flex items-center justify-center ${
                      active
                        ? 'bg-[#ffd21c]/15 border border-[#ffd21c]/70 text-[#ffd21c] font-semibold shadow-[0_0_12px_rgba(255,210,28,0.25)]'
                        : 'bg-gradient-to-r from-white/10 to-white/5 border border-white/10 text-white/80 hover:text-white hover:border-white/25 hover:bg-white/15'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Official Tag Landing View (完全对齐 huangguoai.com /tag/<slug>/ 官方页面) */}
          {selectedGenre !== '全部' && (
            <div className="rounded-2xl bg-gradient-to-br from-[#14161D] via-[#1A1D27] to-[#12141A] border border-white/[0.08] p-4 sm:p-5 space-y-2.5">
              {/* Breadcrumb */}
              <nav aria-label="面包屑" className="flex items-center gap-1.5 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => handleSelectGenre('全部')}
                  className="hover:text-amber-400 transition-colors"
                >
                  首页
                </button>
                <span className="text-slate-600">/</span>
                <span className="text-[#ffd21c] font-medium">{selectedGenre}</span>
              </nav>

              {/* Tag Header & Clear */}
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-base sm:text-xl font-bold text-white tracking-tight">
                  {selectedGenre}短剧在线观看
                </h1>
                <button
                  type="button"
                  onClick={() => handleSelectGenre('全部')}
                  className="h-7 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>清除标签</span>
                </button>
              </div>

              {/* Tag Intro */}
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {tagIntro ||
                  `精选${selectedGenre}题材相关AI成人短剧与AI成人漫剧，持续更新${selectedGenre}题材作品，方便快速浏览相关短剧。`}
              </p>
            </div>
          )}

          {/* Section Heading & Sort Bar (Rendered when filtering by tag or channel) */}
          {!isHomePage && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 rounded-full bg-[#ffd21c]" />
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {selectedGenre !== '全部'
                    ? `全部${selectedGenre}短剧 · 共 ${tagTotalCount || sortedDramas.length} 部`
                    : activeChannel === '短剧'
                    ? channelSubFilter === 'hot'
                      ? '当前热播的AI成人短剧'
                      : channelSubFilter === 'recommended'
                      ? '精选推荐的AI成人短剧'
                      : '最新更新的AI成人短剧'
                    : activeChannel === '漫剧'
                    ? channelSubFilter === 'hot'
                      ? '当前热播的AI成人漫剧'
                      : channelSubFilter === 'recommended'
                      ? '精选推荐的AI成人漫剧'
                      : '最新更新的AI成人漫剧'
                    : activeChannel === '黄果原创'
                    ? '精选独家原创短剧与漫剧'
                    : '最新更新短剧'}
                </h2>
                {isTagLoading || isChannelLoading ? (
                  <span className="text-xs text-amber-400/80 animate-pulse font-normal">
                    同步中...
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 font-mono">
                    共 {selectedGenre !== '全部' ? (tagTotalCount || sortedDramas.length) : (channelTotalCount || sortedDramas.length)} 部
                  </span>
                )}
              </div>

              {/* Compact Sort Segmented Control */}
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#14161D] border border-white/[0.08]">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSortMode(opt.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-[#0B0C10]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ======================================================== */}
      {/* Official Homepage Modular Sections (huangguoai.com 对齐) */}
      {/* ======================================================== */}
      {isHomePage ? (
        <div className="space-y-8 pb-4">
          {/* Section 2: 黄果原创 */}
          <section aria-label="黄果原创" className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[#ffd21c]" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  黄果原创
                </h2>
              </div>
              <button
                type="button"
                onClick={() => handleSelectChannel('黄果原创')}
                className="text-xs text-slate-400 hover:text-[#ffd21c] inline-flex items-center gap-0.5 transition-colors group"
              >
                <span>查看全部</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
              {homeSections.original.map((drama) => (
                <DramaPoster
                  key={`original-${drama.id}`}
                  drama={drama}
                  badgeType="original-new"
                  onSelect={(item) => onPlayDrama(item)}
                  onSelectTag={(tag) => handleSelectGenre(tag)}
                />
              ))}
            </div>
          </section>

          {/* Section 3: 精选推荐 */}
          <section aria-label="精选推荐" className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[#ffd21c]" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  精选推荐
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSortMode('recommended')}
                className="text-xs text-slate-400 hover:text-[#ffd21c] inline-flex items-center gap-0.5 transition-colors group"
              >
                <span>更多推荐</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
              {homeSections.featured.map((drama) => (
                <DramaPoster
                  key={`featured-${drama.id}`}
                  drama={drama}
                  badgeType="original-hot"
                  onSelect={(item) => onPlayDrama(item)}
                  onSelectTag={(tag) => handleSelectGenre(tag)}
                />
              ))}
            </div>
          </section>

          {/* Section 4: 最近上新 */}
          <section aria-label="最近上新" className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[#ffd21c]" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  最近上新
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSortMode('latest')}
                className="text-xs text-slate-400 hover:text-[#ffd21c] inline-flex items-center gap-0.5 transition-colors group"
              >
                <span>全部上新</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {homeSections.latest.map((drama) => (
                <DramaPoster
                  key={`latest-${drama.id}`}
                  drama={drama}
                  badgeType="new"
                  onSelect={(item) => onPlayDrama(item)}
                  onSelectTag={(tag) => handleSelectGenre(tag)}
                />
              ))}
            </div>
          </section>

          {/* Section 5: 热播短剧 */}
          <section aria-label="热播短剧" className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[#ffd21c]" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  热播短剧
                </h2>
              </div>
              <button
                type="button"
                onClick={() => handleSelectChannel('排行榜')}
                className="text-xs text-slate-400 hover:text-[#ffd21c] inline-flex items-center gap-0.5 transition-colors group"
              >
                <span>完整榜单</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {homeSections.hot.map((drama) => (
                <DramaPoster
                  key={`hot-${drama.id}`}
                  drama={drama}
                  badgeType="hot"
                  onSelect={(item) => onPlayDrama(item)}
                  onSelectTag={(tag) => handleSelectGenre(tag)}
                />
              ))}
            </div>
          </section>

          {/* Section 6: 专题推荐 */}
          {topics.length > 0 && (
            <section aria-label="专题推荐" className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-[#ffd21c]" />
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                    专题推荐
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectChannel('专题')}
                  className="text-xs text-slate-400 hover:text-[#ffd21c] inline-flex items-center gap-0.5 transition-colors group"
                >
                  <span>查看全部</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
                {topics.slice(0, 3).map((topic, idx) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setSelectedTopic(topic);
                      onPushHistoryLayer?.('topic-detail');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl text-left border border-white/[0.08] hover:border-amber-500/40 active:scale-[0.99] transition-all min-h-[168px] sm:min-h-[200px] flex items-end ${
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

                    <div className="relative z-10 p-4 sm:p-5 space-y-1 max-w-xl">
                      <p className="text-xs text-amber-300 font-medium">
                        {topic.accentNote}
                      </p>
                      <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-amber-300 transition-colors">
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
        </div>
      ) : (
        /* Channel / Tag / Filtered Grid View */
        <>
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
                      handleSelectGenre('全部');
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
                      onSelectTag={(tag) => handleSelectGenre(tag)}
                    />
                  ))}
                </div>
              )}

              {/* Pagination / Load More Button for Channel (支持全站 1879+ 短剧翻页) */}
              {activeChannel !== '全部' && !isRankingOnlyView && !isTopicsOnlyView && selectedGenre === '全部' && (
                <div className="pt-4 pb-2 flex justify-center">
                  {channelHasMore ? (
                    <button
                      type="button"
                      onClick={handleLoadMoreChannel}
                      disabled={isLoadingMore}
                      className="min-h-[44px] px-6 rounded-2xl bg-[#14161D] border border-white/10 hover:border-[#ffd21c]/50 text-white text-xs font-semibold inline-flex items-center gap-2 active:scale-95 transition-all shadow-lg"
                    >
                      {isLoadingMore ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-[#ffd21c] border-t-transparent rounded-full animate-spin" />
                          <span>正在加载更多短剧...</span>
                        </>
                      ) : (
                        <>
                          <span>加载更多短剧 ({channelRemoteDramas.length}/{channelTotalCount || channelRemoteDramas.length})</span>
                          <ChevronRight className="w-4 h-4 rotate-90 text-[#ffd21c]" />
                        </>
                      )}
                    </button>
                  ) : (
                    channelRemoteDramas.length > 0 && (
                      <p className="text-xs text-slate-500 font-mono">
                        已加载全部 {channelTotalCount || channelRemoteDramas.length} 部短剧
                      </p>
                    )
                  )}
                </div>
              )}
            </section>
          )}

          {/* Top Rankings Section */}
          {(isRankingOnlyView || (!selectedTopic && !isTopicsOnlyView)) && (
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
          {(isTopicsOnlyView || (!selectedTopic && !isRankingOnlyView && topics.length > 0)) && (
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
        </>
      )}

      {/* Official 9-Category Tags Bottom Sheet (huangguoai.com 全维度官方题材分类抽屉) */}
      {showGenreSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="选择题材与分类标签"
          onClick={() => setShowGenreSheet(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full sm:max-w-xl max-h-[85vh] rounded-t-3xl sm:rounded-3xl bg-[#14161D] border-t sm:border border-white/10 p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] flex flex-col gap-3 shadow-2xl overflow-hidden"
          >
            {/* Sheet Handle */}
            <div className="sm:hidden flex justify-center -mt-1 mb-0.5">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <h3 className="text-base font-bold text-white">选择分类题材与标签</h3>
                <span className="text-xs text-slate-500 font-mono">
                  (9大分类 · {tagCategories.reduce((acc, c) => acc + c.tags.length, 0)}+ 标签)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowGenreSheet(false)}
                aria-label="关闭标签筛选"
                className="min-h-[40px] min-w-[40px] -mr-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Search Input for fast tag lookup */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索任意标签，如：人妻、绿帽、熟女、系统、母子..."
                value={tagSearchQuery}
                onChange={(e) => setTagSearchQuery(e.target.value)}
                className="w-full bg-[#1D202A] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"
              />
              {tagSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTagSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Official 9 Categories Tab Pills */}
            {!tagSearchQuery && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setActiveTagCategoryCode('all')}
                  className={`min-h-[30px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeTagCategoryCode === 'all'
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-[#1D202A] text-slate-400 hover:text-white'
                  }`}
                >
                  热门推荐 (20)
                </button>
                {tagCategories.map((cat) => {
                  const active = activeTagCategoryCode === cat.code;
                  return (
                    <button
                      key={cat.code}
                      type="button"
                      onClick={() => setActiveTagCategoryCode(cat.code)}
                      className={`min-h-[30px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                        active
                          ? 'bg-amber-400 text-black shadow'
                          : 'bg-[#1D202A] text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat.name} ({cat.tags.length})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tags Grid */}
            <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[46vh] no-scrollbar pr-1 space-y-4">
              {tagSearchQuery.trim() ? (
                // Filtered tags by user search query
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    搜索 “{tagSearchQuery}” 匹配到的官方标签：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tagCategories
                      .flatMap((c) => c.tags)
                      .filter((t) => t.name.includes(tagSearchQuery.trim()))
                      .map((t) => {
                        const active = selectedGenre === t.name;
                        return (
                          <button
                            key={`${t.id}-${t.name}`}
                            type="button"
                            onClick={() => {
                              handleSelectGenre(t.name);
                              setShowGenreSheet(false);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                              active
                                ? 'bg-amber-400 text-black font-bold shadow'
                                : 'bg-[#1D202A] text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {t.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : activeTagCategoryCode === 'all' ? (
                // Popular Top 20 Tags
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>黄果短剧官方首页核心推荐题材</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectGenre('全部');
                        setShowGenreSheet(false);
                      }}
                      className="text-amber-400 hover:text-amber-300 font-medium"
                    >
                      重置为全部
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {POPULAR_TAGS.map((tag) => {
                      const active = selectedGenre === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            handleSelectGenre(tag);
                            setShowGenreSheet(false);
                          }}
                          className={`min-h-[40px] px-2 rounded-xl text-xs font-medium transition-colors truncate flex items-center justify-center gap-1 ${
                            active
                              ? 'bg-amber-400 text-[#0B0C10] font-bold shadow'
                              : 'bg-[#1D202A] text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Category Specific Tags
                <div className="space-y-2">
                  {tagCategories
                    .filter((c) => c.code === activeTagCategoryCode)
                    .map((cat) => (
                      <div key={cat.code} className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>
                            {cat.name} · 共 {cat.tags.length} 个标签
                          </span>
                          {selectedGenre !== '全部' && (
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectGenre('全部');
                                setShowGenreSheet(false);
                              }}
                              className="text-amber-400 hover:text-amber-300 font-medium"
                            >
                              清除筛选
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {cat.tags.map((t) => {
                            const active = selectedGenre === t.name;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  handleSelectGenre(t.name);
                                  setShowGenreSheet(false);
                                }}
                                className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium transition-all truncate flex items-center justify-center gap-1 ${
                                  active
                                    ? 'bg-amber-400 text-[#0B0C10] font-bold shadow'
                                    : 'bg-[#1D202A] text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span>{t.name}</span>
                                {t.isHot && (
                                  <Flame className="w-3 h-3 text-red-400 fill-current shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  handleSelectGenre('全部');
                  setShowGenreSheet(false);
                }}
                className="min-h-[40px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-300 transition-colors"
              >
                重置为全部题材
              </button>
              <button
                type="button"
                onClick={() => setShowGenreSheet(false)}
                className="min-h-[40px] px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs font-bold text-black transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
