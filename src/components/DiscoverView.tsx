import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Flame,
  Play,
  Search,
} from 'lucide-react';
import { deriveRankings } from '../services/dramaApi';
import type { Drama, RankingType, Topic } from '../types/drama';
import { DramaPoster } from './DramaPoster';

interface DiscoverViewProps {
  dramas: Drama[];
  topics: Topic[];
  followedIds: string[];
  loading: boolean;
  warning?: string;
  onPlayDrama: (drama: Drama, episodeNumber?: number) => void;
  onToggleFollow: (dramaId: string) => void;
  onOpenSearch: () => void;
}

const FILTER_OPTIONS = [
  '全部',
  'AI短剧',
  '原创短剧',
  'AI漫剧',
  '科幻',
  '古风',
  '悬疑',
  '都市',
] as const;

type FilterOption = (typeof FILTER_OPTIONS)[number];

export function DiscoverView({
  dramas,
  topics,
  followedIds,
  loading,
  warning,
  onPlayDrama,
  onToggleFollow,
  onOpenSearch,
}: DiscoverViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterOption>('全部');
  const [rankingTab, setRankingTab] = useState<RankingType>('hot');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);

  const featuredDrama = useMemo(
    () => dramas.find((d) => d.isFeatured) ?? dramas[0],
    [dramas]
  );

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
        d.genres.some((genre) => genre === activeFilter)
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
          className="rounded-2xl bg-[#14161D] border border-amber-500/30 px-4 py-3 text-xs sm:text-sm text-amber-200/95"
        >
          {warning}
        </div>
      )}

      {/* Mobile quick search trigger */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-full min-h-[44px] px-4 rounded-2xl bg-[#14161D] border border-white/[0.08] flex items-center gap-3 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Search className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">搜索剧名、AI漫剧、悬疑、古风...</span>
        </button>
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
              {!heroImgError ? (
                <img
                  src={featuredDrama.heroUrl ?? featuredDrama.posterUrl}
                  alt={featuredDrama.title}
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1D202A] via-[#14161D] to-[#0B0C10]" />
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

      {/* Interactive Category Segmented Bar */}
      {!selectedTopic && (
        <section aria-label="题材与频道筛选" className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTER_OPTIONS.map((option) => {
              const active = activeFilter === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setActiveFilter(option)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    active
                      ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                      : 'bg-[#14161D] text-slate-300 border border-white/[0.08] hover:text-white hover:border-white/20'
                  }`}
                >
                  {option}
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
              onClick={() => setActiveFilter('全部')}
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
              onClick={() => setActiveFilter('全部')}
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
                      <img
                        src={drama.posterUrl}
                        alt={drama.title}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
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
                  <img
                    src={topic.coverUrl}
                    alt={topic.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
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
