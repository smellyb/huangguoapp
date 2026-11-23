import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Flame, Loader2, Search, Trash2, X } from 'lucide-react';
import { HOT_SEARCH_TERMS } from '../data/demoCatalog';
import {
  fetchHotSearchKeywords,
  filterDramasByQuery,
  searchRemoteDramas,
} from '../services/dramaApi';
import type { Drama } from '../types/drama';
import { DramaPoster } from './DramaPoster';

interface SearchViewProps {
  dramas: Drama[];
  searchHistory: string[];
  apiBaseUrl?: string;
  onBack?: () => void;
  onAddSearchTerm: (term: string) => void;
  onRemoveSearchTerm: (term: string) => void;
  onClearSearchHistory: () => void;
  onPlayDrama: (drama: Drama) => void;
}

export function SearchView({
  dramas,
  searchHistory,
  apiBaseUrl,
  onBack,
  onAddSearchTerm,
  onRemoveSearchTerm,
  onClearSearchHistory,
  onPlayDrama,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [hotKeywords, setHotKeywords] = useState<string[]>(HOT_SEARCH_TERMS);
  const [remoteResults, setRemoteResults] = useState<Drama[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) return;
    fetchHotSearchKeywords(apiBaseUrl).then((keywords) => {
      if (keywords && keywords.length > 0) {
        setHotKeywords(keywords);
      }
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !apiBaseUrl) {
      setRemoteResults([]);
      setIsSearchingRemote(false);
      return;
    }

    let active = true;
    setIsSearchingRemote(true);

    const timer = window.setTimeout(() => {
      searchRemoteDramas(apiBaseUrl, trimmed)
        .then((items) => {
          if (!active) return;
          setRemoteResults(items);
        })
        .finally(() => {
          if (active) setIsSearchingRemote(false);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apiBaseUrl, query]);

  const localResults = useMemo(
    () => filterDramasByQuery(dramas, query),
    [dramas, query]
  );

  const mergedResults = useMemo(() => {
    if (!query.trim()) return [];
    const seen = new Set<string>();
    const list: Drama[] = [];

    for (const d of localResults) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        list.push(d);
      }
    }

    for (const d of remoteResults) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        list.push(d);
      }
    }

    return list;
  }, [localResults, query, remoteResults]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim()) {
      onAddSearchTerm(query.trim());
      inputRef.current?.blur();
    }
  };

  const applyKeyword = (term: string) => {
    setQuery(term);
    onAddSearchTerm(term);
    inputRef.current?.blur();
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Mobile Native Sticky Search Bar with Back & Safe Area */}
      <div className="sticky top-0 md:static z-30 bg-[#0B0C10]/95 md:bg-transparent backdrop-blur-md border-b border-white/[0.08] md:border-0 pt-safe">
        <div className="px-3 sm:px-6 lg:px-8 py-2.5 md:pt-8 md:pb-4 flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="返回"
              className="md:hidden min-h-[44px] min-w-[44px] -ml-1.5 rounded-xl flex items-center justify-center text-slate-200 hover:text-white active:scale-95 transition-transform shrink-0"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          <form onSubmit={handleSubmit} className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜剧名、题材、漫剧、AI换脸..."
              aria-label="搜索短剧"
              className="w-full min-h-[44px] md:min-h-[50px] pl-10 pr-24 rounded-xl md:rounded-2xl bg-[#14161D] border border-white/10 text-sm sm:text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />

            <div className="absolute right-16 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearchingRemote && (
                <Loader2
                  className="w-4 h-4 text-amber-400 animate-spin"
                  aria-hidden="true"
                />
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="清空搜索词"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="min-h-[34px] md:min-h-[38px] px-3.5 rounded-lg md:rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-xs font-semibold absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors whitespace-nowrap"
            >
              搜索
            </button>
          </form>
        </div>
      </div>

      {/* Main Search Content */}
      <div className="px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        {query.trim() ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-semibold text-slate-200 tabular-nums">
                找到 {mergedResults.length} 部相关短剧
                {isSearchingRemote && (
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    正在检索更多...
                  </span>
                )}
              </h2>
            </div>

            {mergedResults.length === 0 && !isSearchingRemote ? (
              <div className="rounded-2xl bg-[#14161D] border border-white/[0.08] py-12 px-5 text-center space-y-4">
                <p className="text-sm font-medium text-slate-200">
                  未找到与“{query.trim()}”相关的短剧
                </p>
                <p className="text-xs text-slate-400">
                  换个关键词试试，或点击下方热门词
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {hotKeywords.slice(0, 6).map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => applyKeyword(term)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-amber-500 hover:text-[#0B0C10] text-xs font-medium text-slate-200 transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {mergedResults.map((drama) => (
                  <DramaPoster
                    key={drama.id}
                    drama={drama}
                    onSelect={(item) => {
                      onAddSearchTerm(query.trim());
                      onPlayDrama(item);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            {/* Recent Search History */}
            {searchHistory.length > 0 && (
              <section className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-100 inline-flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span>最近搜索</span>
                  </h2>
                  <button
                    type="button"
                    onClick={onClearSearchHistory}
                    className="min-h-[40px] px-2 text-xs text-slate-400 hover:text-amber-400 inline-flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>清空</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {searchHistory.map((term) => (
                    <div
                      key={term}
                      className="inline-flex items-center rounded-xl bg-[#14161D] border border-white/[0.08] text-xs text-slate-200"
                    >
                      <button
                        type="button"
                        onClick={() => applyKeyword(term)}
                        className="min-h-[40px] pl-3.5 pr-1.5 hover:text-amber-400 transition-colors"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveSearchTerm(term)}
                        aria-label={`删除搜索词 ${term}`}
                        className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Hot Search Terms */}
            <section
              className={`${
                searchHistory.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
              } space-y-3`}
            >
              <h2 className="text-sm sm:text-base font-semibold text-slate-100 inline-flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" aria-hidden="true" />
                <span>大家都在搜</span>
              </h2>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                {hotKeywords.map((term, idx) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => applyKeyword(term)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/45 text-xs sm:text-sm font-medium text-slate-200 hover:text-amber-300 transition-colors inline-flex items-center gap-2 active:scale-[0.98]"
                  >
                    <span
                      className={`font-mono font-bold text-xs tabular-nums ${
                        idx < 3 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
