import { useState, useEffect } from 'react';
import { Film, Play } from 'lucide-react';
import type { Drama } from '../types/drama';
import { decryptCoverImage, getCachedDecryptedUrl } from '../services/imageDecryptor';

export interface CoverPlaceholderProps {
  title?: string;
  category?: string;
  genres?: string[];
  compact?: boolean;
  className?: string;
}

export function CoverPlaceholder({
  title,
  category,
  genres,
  compact = false,
  className = '',
}: CoverPlaceholderProps) {
  return (
    <div
      data-testid="cover-placeholder"
      className={`cover-placeholder relative h-full w-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-[#1D202A] via-[#14161D] to-[#0B0C10] select-none ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 max-w-[90%]">
        <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
          <Film className="w-4 h-4" aria-hidden="true" />
        </div>
        {title && (
          <span className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug">
            {title}
          </span>
        )}
        {(category || (genres && genres.length > 0)) && !compact && (
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-amber-300/80 font-mono">
            {category || genres?.[0]}
          </span>
        )}
      </div>
    </div>
  );
}

export interface DramaCoverImageProps {
  src: string;
  alt: string;
  fallbackId?: string | number;
  className?: string;
  title?: string;
  category?: string;
  genres?: string[];
  compact?: boolean;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  loading?: 'lazy' | 'eager';
}

export function DramaCoverImage({
  src,
  alt,
  className = '',
  title,
  category,
  genres,
  compact = false,
  referrerPolicy = 'no-referrer',
  loading = 'lazy',
}: DramaCoverImageProps) {
  const [decryptedUrl, setDecryptedUrl] = useState<string>(() => getCachedDecryptedUrl(src) || '');
  const [stage, setStage] = useState<'decrypting' | 'ready' | 'placeholder'>(() => {
    if (!src || !src.trim()) return 'placeholder';
    if (getCachedDecryptedUrl(src)) return 'ready';
    return 'decrypting';
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    if (!src || typeof src !== 'string' || !src.trim()) {
      setStage('placeholder');
      setDecryptedUrl('');
      return;
    }

    const cached = getCachedDecryptedUrl(src);
    if (cached) {
      setDecryptedUrl(cached);
      setStage('ready');
      return;
    }

    setStage('decrypting');
    setLoaded(false);

    decryptCoverImage(src)
      .then((objectUrl) => {
        if (!active) return;
        if (objectUrl) {
          setDecryptedUrl(objectUrl);
          setStage('ready');
        } else {
          setStage('placeholder');
        }
      })
      .catch((err) => {
        console.warn('[DramaCoverImage] Decrypt error:', err);
        if (!active) return;
        setStage('placeholder');
      });

    return () => {
      active = false;
    };
  }, [src]);

  const handleError = () => {
    setStage('placeholder');
  };

  if (stage === 'placeholder' || !decryptedUrl) {
    return (
      <CoverPlaceholder
        title={title}
        category={category}
        genres={genres}
        compact={compact}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#14161D]">
      <img
        src={decryptedUrl}
        alt={alt}
        loading={loading}
        decoding="async"
        referrerPolicy={referrerPolicy}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
      />
      {!loaded && (
        <div className="cover-placeholder absolute inset-0 bg-[#14161D] animate-pulse flex items-center justify-center">
          <Film className="w-5 h-5 text-amber-500/20" />
        </div>
      )}
    </div>
  );
}

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
  return (
    <button
      type="button"
      onClick={() => onSelect(drama)}
      className="group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-2xl transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[#14161D] border border-white/[0.08]">
        <DramaCoverImage
          src={drama.posterUrl}
          alt={drama.title}
          title={drama.title}
          category={drama.category}
          genres={drama.genres}
          compact={compact}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="w-11 h-11 rounded-full bg-amber-500/95 text-[#0B0C10] flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 space-y-1 pointer-events-none">
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
