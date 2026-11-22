import { useState } from 'react';
import { Film, Play } from 'lucide-react';
import type { Drama } from '../types/drama';

interface DramaPosterProps {
  drama: Drama;
  onSelect: (drama: Drama) => void;
  subtitle?: string;
  compact?: boolean;
}

export function DramaPoster({
  drama,
  onSelect,
  subtitle,
  compact = false,
}: DramaPosterProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(drama)}
      className="group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-2xl transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[#14161D] border border-white/[0.08]">
        {!imgError ? (
          <img
            src={drama.posterUrl}
            alt={drama.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1D202A] via-[#14161D] to-[#0B0C10] p-4 text-center">
            <Film className="w-7 h-7 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 line-clamp-2">
              {drama.title}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="w-11 h-11 rounded-full bg-amber-500/95 text-[#0B0C10] flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-200/90 font-mono tabular-nums">
            <span className="truncate">
              {drama.status === '已完结'
                ? `全 ${drama.totalEpisodes} 集`
                : `更至 ${drama.updatedEpisodes} 集`}
            </span>
            <span className="shrink-0 text-amber-300">{drama.playCountLabel}</span>
          </div>
        </div>
      </div>

      <div className={compact ? 'mt-2 space-y-0.5' : 'mt-2.5 space-y-1'}>
        <h3 className="text-sm font-semibold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
          {drama.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-1">
          {subtitle ??
            `${drama.category} · ${drama.genres.slice(0, 2).join(' / ')}`}
        </p>
      </div>
    </button>
  );
}
