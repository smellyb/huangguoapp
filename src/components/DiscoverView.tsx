import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Flame,
  Play,
  Search,
} from 'lucide-react';
import { cleanCoverUrl, deriveRankings, getFallbackPoster } from '../services/dramaApi';
import { POPULAR_TAGS, type Drama, type RankingType, type Topic } from '../types/drama';
import { DramaCoverImage, DramaPoster } from './DramaPoster';

interface DiscoverViewProps {
  dramas: Drama[];
  topics: Topic[];
  followedIds: string[];
  loading: boolean;
  warning?: string;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  onPlayDrama: (drama: Drama, episodeNumber?: number) => void;
  onToggleFollow: (dramaId: string) => void;
  onOpenSearch: () => void;
  onOpenLineSelector?: () => void;
}

const FILTER_CATEGORIES = [
  '全部',
  '短剧',
  '漫剧',
  'AI换脸',
  'AI魔改',
] as const;

export function DiscoverView({
  dramas,
  topics,
  followedIds,
  loading,
  warning,
  selectedCategory,
  onSelectCategory,
  onPlayDrama,
  onToggleFollow,
  onOpenSearch,
  onOpenLineSelector,
}: DiscoverViewProps) {
  const [activeFilter, setActiveFilter] = useState<string>(selectedCategory || '全部');
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

  const featuredDrama = useMemo(
    () => dramas.find((d) => d.isFeatured) ?? dramas[0],
    [dramas]
  );

  const heroSrc = featuredDrama ? (featuredDrama.heroUrl ?? featuredDrama.posterUrl) : '';
  const [heroStage, setHeroStage] = useState<'primary' | 'clean' | 'fallback' | 'placeholder'>('primary');

  useEffect(() => {
    setHeroStage('primary');
  }, [featuredDrama?.id, heroSrc]);

  const cleanHeroSrc = useMemo(() => cleanCoverUrl(heroSrc), [heroSrc]);
  const fallbackHeroSrc = useMemo(
    () => (featuredDrama ? getFallbackPoster(featuredDrama.id) : ''),
    [featuredDrama]
  );

  const currentHeroSrc = useMemo(() => {
    switch (heroStage) {
      case 'primary':
        return heroSrc;
      case 'clean':
        return cleanHeroSrc;
      case 'fallback':
        return fallbackHeroSrc;
      case 'placeholder':
        return '';
    }
  }, [heroStage, heroSrc, cleanHeroSrc, fallbackHeroSrc]);

  const handleHeroError = () => {
    if (heroStage === 'primary') {
      if (cleanHeroSrc && cleanHeroSrc !== heroSrc) {
        setHeroStage('clean');
        return;
      }
      if (fallbackHeroSrc && fallbackHeroSrc !== heroSrc) {
        setHeroStage('fallback');
        return;
      }
      setHeroStage('placeholder');
    } else if (heroStage === 'clean') {
      if (fallbackHeroSrc && fallbackHeroSrc !== cleanHeroSrc) {
        setHeroStage('fallback');
        return;
      }
      setHeroStage('placeholder');
    } else {
      setHeroStage('placeholder');
    }
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
      ) : (
        featuredDrama && (
          <section className="relative overflow-hidden rounded-3xl bg-[#14161D] border border-white/[0.08]">
            <div className="relative min-h-[300px] sm:min-h-[380px] lg:min-h-[430px] flex items-end">
              {heroStage !== 'placeholder' && currentHeroSrc ? (
                <img
                  src={currentHeroSrc}
                  alt={featuredDrama.title}
                  referrerPolicy="no-referrer"
                  onError={handleHeroError}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : (
                <div
                  data-testid="cover-placeholder"
                  className="cover-placeholder absolute inset-0 bg-gradient-to-br from-[#1D202A] via-[#14161D] to-[#0B0C10]"
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/65 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B0C10]/90 via-[#0B0C10]/45 to-transparent" />

              <div className="relative z-10 w-full p-6 sm:p-10 lg:p-12 max-w-2xl space-y-4">
                <p className="text-xs sm:text-sm text-amber-300/95 font-medium">
                  今日主推 <span aria-hidden="true">·</span> {featuredDrama.category}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  {featuredDrama.genres.join(' / ')}
                </p>

                <h1
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.12]"
                  style={{ textWrap: 'balance' }}
                >
                  {featuredDrama.title}
                </h1>

                <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed line-clamp-2 sm:line-clamp-3">
                  {featuredDrama.tagline}
                </p>

                <p className="text-xs text-slate-300 font-mono tabular-nums">
                  {featuredDrama.status === '已完结'
                    ? `全 ${featuredDrama.totalEpisodes} 集`
                    : `更至 ${featuredDrama.updatedEpisodes} / ${featuredDrama.totalEpisodes} 集`}{' '}
                  <span aria-hidden="true">·</span> {featuredDrama.playCountLabel} 播放{' '}
                  <span aria-hidden="true">·</span> {featuredDrama.studio}
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onPlayDrama(featuredDrama)}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0C10]"
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    <span>立即观看</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleFollow(featuredDrama.id)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 border border-white/15 text-sm font-medium inline-flex items-center gap-2 backdrop-blur-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    {followedIds.includes(featuredDrama.id) ? (
                      <>
                        <BookmarkCheck className="w-4 h-4 text-amber-400" aria-hidden="true" />
                        <span>已追剧</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" aria-hidden="true" />
                        <span>加入追剧</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )
      )}

      {/* Interactive Category Segmented Bar & Popular Tags */}
      {!selectedTopic && (
        <section aria-label="题材与频道筛选" className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTER_CATEGORIES.map((option) => {
              const active = activeFilter === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelectFilter(option)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    active
                      ? 'bg-amber-500 text-[#0B0C10] font-semibold shadow-md shadow-amber-500/10'
                      : 'bg-[#14161D] text-slate-300 border border-white/[0.08] hover:text-white hover:border-white/20'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {/* Official Popular Tags Bar (Synced with huangguoai.com) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
            <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1 pr-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              热门标签:
            </span>
            {POPULAR_TAGS.map((tag) => {
              const active = activeFilter === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectFilter(tag)}
                  aria-pressed={active}
                  className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    active
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold'
                      : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-200 hover:border-white/15'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* New Releases / Filtered Grid */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-50">
              {selectedTopic
                ? '专题片单'
                : activeFilter === '全部'
                  ? '最新上架'
                  : `${activeFilter}精选`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 tabular-nums">
              共 {filteredDramas.length} 部短剧 <span aria-hidden="true">·</span> 点击海报直达竖屏剧场
            </p>
          </div>

          {!selectedTopic && activeFilter !== '全部' && (
            <button
              type="button"
              onClick={() => handleSelectFilter('全部')}
              className="min-h-[44px] text-xs sm:text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              查看全部
            </button>
          )}
        </div>

        {filteredDramas.length === 0 ? (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
            {filteredDramas.map((drama) => (
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
