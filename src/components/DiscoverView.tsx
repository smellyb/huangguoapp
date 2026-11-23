import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Flame,
  Search,
} from 'lucide-react';
import { deriveRankings } from '../services/dramaApi';
import { POPULAR_TAGS, type Drama, type RankingType, type Topic } from '../types/drama';
import { DramaCoverImage, DramaPoster } from './DramaPoster';

interface DiscoverViewProps {
  dramas: Drama[];
  topics: Topic[];
  followedIds?: string[];
  loading: boolean;
  warning?: string;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  onPlayDrama: (drama: Drama, episodeNumber?: number) => void;
  onToggleFollow?: (dramaId: string) => void;
  onOpenSearch: () => void;
  onOpenLineSelector?: () => void;
}

export function DiscoverView({
  dramas,
  topics,
  followedIds: _followedIds,
  loading,
  warning,
  selectedCategory,
  onSelectCategory,
  onPlayDrama,
  onToggleFollow: _onToggleFollow,
  onOpenSearch,
  onOpenLineSelector,
}: DiscoverViewProps) {
  const [activeFilter, setActiveFilter] = useState<string>(selectedCategory || '全部');
  const [sortMode, setSortMode] = useState<'latest' | 'hot' | 'recommended'>('latest');
  const [rankingTab, setRankingTab] = useState<RankingType>('hot');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  useEffect(() => {
    if (selectedCategory && selectedCategory !== activeFilter) {
      setActiveFilter(selectedCategory);
    }
  }, [selectedCategory]);

  const handleSelectFilter = (filter: string) => {
    setActiveFilter(filter);
    onSelectCategory?.(filter);
  };

  const filteredDramas = useMemo(() => {
    if (selectedTopic) {
      const idSet = new Set(selectedTopic.dramaIds);
      const matched = dramas.filter((d) => idSet.has(d.id));
      return matched.length > 0 ? matched : dramas;
    }

    if (activeFilter === '全部') return dramas;
    return dramas.filter(
      (d) =>
        d.category === activeFilter ||
        d.genres.some((genre) => genre === activeFilter) ||
        d.tagline.includes(activeFilter) ||
        d.synopsis.includes(activeFilter)
    );
  }, [dramas, activeFilter, selectedTopic]);

  const currentCategoryTitle = useMemo(() => {
    if (!activeFilter || activeFilter === '全部') return 'AI成人短剧';
    if (activeFilter === '短剧') return 'AI成人短剧';
    if (activeFilter === '黄果原创') return '黄果独家原创短剧';
    if (activeFilter === '漫剧') return 'AI成人漫剧';
    return activeFilter;
  }, [activeFilter]);

  const sectionTitle = useMemo(() => {
    switch (sortMode) {
      case 'latest':
        return `最新更新的${currentCategoryTitle}`;
      case 'hot':
        return `当前热播的${currentCategoryTitle}`;
      case 'recommended':
        return `精选推荐的${currentCategoryTitle}`;
    }
  }, [sortMode, currentCategoryTitle]);

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
    () => deriveRankings(dramas, rankingTab).slice(0, 6),
    [dramas, rankingTab]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <div className="h-[260px] sm:h-[360px] rounded-3xl bg-[#14161D] border border-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <div className="aspect-[3/4] rounded-2xl bg-[#14161D] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[#14161D] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-10 sm:space-y-14">
      {warning && (
        <div
          role="status"
          className="rounded-2xl bg-[#14161D] border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-200/95"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-400">⚠️</span>
            <span>{warning}</span>
          </div>
          {onOpenLineSelector && (
            <button
              type="button"
              onClick={onOpenLineSelector}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] font-bold text-xs inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 shadow-md shadow-amber-500/10"
            >
              <span>切换可用直连线路</span>
            </button>
          )}
        </div>
      )}

      {/* Mobile quick search & line trigger */}
      <div className="md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex-1 min-h-[44px] px-4 rounded-2xl bg-[#14161D] border border-white/[0.08] flex items-center gap-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Search className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">搜索短剧、漫剧、AI换脸、题材...</span>
        </button>

        {onOpenLineSelector && (
          <button
            type="button"
            onClick={onOpenLineSelector}
            aria-label="选择线路与测速"
            className="min-h-[44px] px-3.5 rounded-2xl bg-[#14161D] border border-amber-500/30 text-amber-300 flex items-center gap-1.5 text-xs font-semibold shrink-0"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>线路</span>
          </button>
        )}
      </div>

      {/* Topic drill-down header or Hero Spotlight */}
      {selectedTopic ? (
        <section className="rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 sm:p-8 space-y-5">
          <button
            type="button"
            onClick={() => setSelectedTopic(null)}
            className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>返回发现首页</span>
          </button>

          <div className="space-y-2 max-w-2xl">
            <p className="text-xs text-slate-400">
              专题精选 <span aria-hidden="true">·</span> {selectedTopic.accentNote}
            </p>
            <h1
              className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-50"
              style={{ textWrap: 'balance' }}
            >
              {selectedTopic.title}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {selectedTopic.subtitle}
            </p>
          </div>
        </section>
      ) : null}

      {/* Official Category Bar, Breadcrumbs, Sort Pills, and Section Title (Synced with huangguoai.com) */}
      {!selectedTopic && (
        <section aria-label="分类导航与筛选" className="space-y-4 pt-1">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium select-none">
            <button
              type="button"
              onClick={() => handleSelectFilter('全部')}
              className="hover:text-amber-400 transition-colors"
            >
              首页
            </button>
            <span className="text-slate-600">/</span>
            <span className="text-amber-400 font-bold">{currentCategoryTitle}</span>
          </div>

          {/* Subtitle Description */}
          <p className="text-sm sm:text-base text-slate-200 font-normal leading-relaxed">
            <strong className="text-white font-bold">{currentCategoryTitle}</strong> 精选热播短剧，汇集独家原创、精选推荐与最新更新内容。
          </p>

          {/* Filter Pills: [最近更新] [当前热播] [精选推荐] */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setSortMode('latest')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                sortMode === 'latest'
                  ? 'bg-amber-400 text-[#0B0C10] shadow-md shadow-amber-400/20'
                  : 'bg-[#181B24] hover:bg-[#222533] text-slate-300'
              }`}
            >
              最近更新
            </button>
            <button
              type="button"
              onClick={() => setSortMode('hot')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                sortMode === 'hot'
                  ? 'bg-amber-400 text-[#0B0C10] shadow-md shadow-amber-400/20'
                  : 'bg-[#181B24] hover:bg-[#222533] text-slate-300'
              }`}
            >
              当前热播
            </button>
            <button
              type="button"
              onClick={() => setSortMode('recommended')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                sortMode === 'recommended'
                  ? 'bg-amber-400 text-[#0B0C10] shadow-md shadow-amber-400/20'
                  : 'bg-[#181B24] hover:bg-[#222533] text-slate-300'
              }`}
            >
              精选推荐
            </button>
          </div>

          {/* Section Title with bold yellow vertical bar | */}
          <div className="pt-2 flex items-center justify-between gap-4">
            <div className="flex items-center">
              <span className="inline-block w-1.5 h-6 rounded-sm bg-amber-400 mr-2.5 shrink-0" />
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
                {sectionTitle}
              </h2>
            </div>
            {activeFilter !== '全部' && (
              <button
                type="button"
                onClick={() => handleSelectFilter('全部')}
                className="text-xs sm:text-sm text-amber-400 hover:text-amber-300 transition-colors shrink-0 font-medium"
              >
                查看全部
              </button>
            )}
          </div>

          {/* Official Popular Tags Row (Synced with huangguoai.com) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 pb-1">
            {POPULAR_TAGS.map((tag) => {
              const active = activeFilter === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectFilter(tag)}
                  className={`min-h-[30px] px-3.5 py-1 rounded-full text-xs transition-colors whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-amber-400 text-[#0B0C10] font-bold border-amber-400 shadow-sm'
                      : 'bg-[#14161D] text-slate-300 border-white/[0.08] hover:text-white hover:bg-[#1E202B]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Drama Grid */}
      <section className="space-y-4">
        {sortedDramas.length === 0 ? (
          <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] py-14 px-6 text-center space-y-3">
            <p className="text-base font-medium text-slate-200">
              当前分类暂无匹配剧集
            </p>
            <button
              type="button"
              onClick={() => handleSelectFilter('全部')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 text-[#0B0C10] text-sm font-semibold hover:bg-amber-400 transition-colors"
            >
              重置筛选
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4 lg:gap-5">
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

      {/* Top Rankings + Curated Topics */}
      {!selectedTopic && (
        <>
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-50">
                  热播排行榜
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  实时热度与追剧趋势榜单
                </p>
              </div>

              <div
                role="tablist"
                aria-label="排行榜分类"
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#14161D] border border-white/[0.08] self-start sm:self-auto"
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
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rankedDramas.map((drama, index) => {
                const rankNumber = String(index + 1).padStart(2, '0');
                const isTopThree = index < 3;
                return (
                  <button
                    key={drama.id}
                    type="button"
                    onClick={() => onPlayDrama(drama)}
                    className="group w-full text-left flex items-center gap-4 p-3.5 rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <span
                      className={`font-mono text-2xl font-bold tabular-nums w-9 text-center shrink-0 ${
                        isTopThree ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {rankNumber}
                    </span>

                    <div className="w-16 aspect-[3/4] rounded-xl overflow-hidden bg-[#1D202A] shrink-0">
                      <DramaCoverImage
                        src={drama.posterUrl}
                        alt={drama.title}
                        fallbackId={drama.id}
                        title={drama.title}
                        category={drama.category}
                        compact
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-100 group-hover:text-amber-400 transition-colors truncate">
                        {drama.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {drama.tagline}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Flame className="w-3.5 h-3.5" aria-hidden="true" />
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
                      className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0 transition-colors"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Curated Topics Asymmetric Bento */}
          <section className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-50">
                专题推荐
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                按主题策划的高密度短剧合集
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {topics.map((topic, idx) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    setSelectedTopic(topic);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`group relative overflow-hidden rounded-3xl text-left border border-white/[0.08] hover:border-amber-500/40 transition-colors min-h-[200px] sm:min-h-[220px] flex items-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
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

                  <div className="relative z-10 p-6 space-y-1.5 max-w-xl">
                    <p className="text-xs text-amber-300 font-medium">
                      {topic.accentNote}
                    </p>
                    <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-amber-300 transition-colors">
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
        </>
      )}
    </div>
  );
}
