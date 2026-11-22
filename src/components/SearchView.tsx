import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Flame, Search, Trash2, X } from 'lucide-react';
import { HOT_SEARCH_TERMS } from '../data/demoCatalog';
import { filterDramasByQuery } from '../services/dramaApi';
import type { Drama } from '../types/drama';
import { DramaPoster } from './DramaPoster';

interface SearchViewProps {
  dramas: Drama[];
  searchHistory: string[];
  onAddSearchTerm: (term: string) => void;
  onRemoveSearchTerm: (term: string) => void;
  onClearSearchHistory: () => void;
  onPlayDrama: (drama: Drama) => void;
}

export function SearchView({
  dramas,
  searchHistory,
  onAddSearchTerm,
  onRemoveSearchTerm,
  onClearSearchHistory,
  onPlayDrama,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () => filterDramasByQuery(dramas, query),
    [dramas, query]
  );

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
          按剧名、题材、AI漫剧分类或出品工坊即时检索
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
          placeholder="输入剧名、关键词（如：时序折叠、古风、悬疑、AI漫剧）..."
          aria-label="搜索短剧"
          className="w-full min-h-[52px] pl-12 pr-24 rounded-2xl bg-[#14161D] border border-white/10 text-sm sm:text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="清空搜索词"
            className="min-h-[44px] min-w-[44px] absolute right-14 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
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
              找到 {results.length} 部相关短剧
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="rounded-3xl bg-[#14161D] border border-white/[0.08] py-14 px-6 text-center space-y-4">
              <p className="text-base font-medium text-slate-200">
                未找到与“{query.trim()}”相关的短剧
              </p>
              <p className="text-xs sm:text-sm text-slate-400">
                可以试试搜索“科幻”、“古风”、“悬疑”或直接点击下方热搜推荐
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {HOT_SEARCH_TERMS.slice(0, 5).map((term) => (
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
              {results.map((drama) => (
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
                    className="inline-flex items-center rounded-xl bg-[#14161D] border border-white/[0.08] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => applyKeyword(term)}
                      className="min-h-[40px] pl-3.5 pr-2 text-xs sm:text-sm text-slate-200 hover:text-amber-400 transition-colors"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSearchTerm(term)}
                      aria-label={`删除搜索记录 ${term}`}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Hot Search Queries */}
          <section className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-semibold text-slate-100 inline-flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>大家都在搜</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {HOT_SEARCH_TERMS.map((term, idx) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyKeyword(term)}
                  className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[#14161D] border border-white/[0.08] hover:border-amber-500/40 text-left flex items-center gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      idx < 3 ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-slate-100 truncate">{term}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
