import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Flame, Loader2, Search, Trash2, X } from 'lucide-react';
import { HOT_SEARCH_TERMS } from '../data/demoCatalog';
import { fetchHotSearchKeywords, filterDramasByQuery, searchRemoteDramas } from '../services/dramaApi';
import type { Drama } from '../types/drama';
import { DramaPoster } from './DramaPoster';

interface SearchViewProps {
  dramas: Drama[];
  searchHistory: string[];
  apiBaseUrl?: string;
  onAddSearchTerm: (term: string) => void;
  onRemoveSearchTerm: (term: string) => void;
  onClearSearchHistory: () => void;
  onPlayDrama: (drama: Drama) => void;
}

export function SearchView({
  dramas,
  searchHistory,
  apiBaseUrl,
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

  // Fetch real-time hot keywords from remote API if available
  useEffect(() => {
    if (!apiBaseUrl) return;
    fetchHotSearchKeywords(apiBaseUrl).then((keywords) => {
      if (keywords && keywords.length > 0) {
        setHotKeywords(keywords);
      }
    });
  }, [apiBaseUrl]);

  // Debounced remote search
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

  // Merge local matches and remote results
  const localResults = useMemo(
    () => filterDramasByQuery(dramas, query),
    [dramas, query]
  );

  const mergedResults = useMemo(() => {
    if (!query.trim()) return [];
    const seen = new Set<string>();
    const list: Drama[] = [];

    // Local results first
    for (const d of localResults) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        list.push(d);
      }
    }

    // Remote results appended
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
    }
  };

  const applyKeyword = (term: string) => {
    setQuery(term);
    onAddSearchTerm(term);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">站内搜索</h1>
        <p className="text-sm text-slate-400">
          按剧名、题材、短剧/漫剧分类或出品工坊即时检索黄果短剧库
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <Search
          className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入剧名、关键词（如：高三、神瞳、少妇、锁情咒、漫剧、AI换脸）..."
          aria-label="搜索短剧"
          className="w-full min-h-[52px] pl-12 pr-28 rounded-2xl bg-[#14161D] border border-white/10 text-sm sm:text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        />
        <div className="absolute right-20 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {isSearchingRemote && (
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" aria-hidden="true" />
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
          className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-xs sm:text-sm font-semibold absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors whitespace-nowrap"
        >
          搜索
        </button>
      </form>

      {query.trim() ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-slate-100 tabular-nums">
              找到 {mergedResults.length} 部相关短剧
              {isSearchingRemote && (
                <span className="text-xs font-normal text-slate-400 ml-2">（联网检索中...）</span>
              )}
            </h2>
          </div>

          {mergedResults.length === 0 && !isSearchingRemote ? (
            <div className="rounded-3xl bg-[#14161D] border border-white/[0.08] py-14 px-6 text-center space-y-4">
              <p className="text-base font-medium text-slate-200">
                未找到与“{query.trim()}”相关的短剧
              </p>
              <p className="text-xs sm:text-sm text-slate-400">
                可以试试搜索“高三”、“神瞳”、“古风”、“漫剧”或直接点击下方热搜推荐
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {hotKeywords.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => applyKeyword(term)}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-amber-500 hover:text-[#0B0C10] text-xs font-medium text-slate-200 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Recent Search History */}
          <section className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100 inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span>最近搜索</span>
              </h2>
              {searchHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearSearchHistory}
                  className="min-h-[40px] px-2 text-xs text-slate-400 hover:text-amber-400 inline-flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>清空</span>
                </button>
              )}
            </div>

            {searchHistory.length === 0 ? (
              <div className="rounded-2xl bg-[#14161D] border border-white/[0.06] p-5 text-xs text-slate-500">
                暂无搜索记录，输入关键词后会自动保存在本地。
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((term) => (
                  <div
                    key={term}
                    className="group inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl bg-[#14161D] border border-white/[0.08] text-xs text-slate-300 hover:border-amber-500/40"
                  >
                    <button
                      type="button"
                      onClick={() => applyKeyword(term)}
                      className="hover:text-amber-400 transition-colors"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSearchTerm(term)}
                      aria-label={`删除搜索词 ${term}`}
                      className="min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-500 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Hot Search Terms */}
          <section className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-semibold text-slate-100 inline-flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>全网热搜词</span>
            </h2>

            <div className="flex flex-wrap gap-2.5">
              {hotKeywords.map((term, idx) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyKeyword(term)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/50 hover:bg-amber-500/10 text-xs sm:text-sm font-medium text-slate-200 hover:text-amber-300 transition-colors inline-flex items-center gap-2"
                >
                  <span
                    className={`font-mono font-bold text-xs ${
                      idx < 3 ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    0{idx + 1}
                  </span>
                  <span>{term}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
