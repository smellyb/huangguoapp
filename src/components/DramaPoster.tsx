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
  onSelectTag?: (tag: string) => void;
  subtitle?: string;
  compact?: boolean;
}

export function DramaPoster({
  drama,
  onSelect,
  onSelectTag,
  subtitle,
  compact = false,
}: DramaPosterProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(drama)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(drama);
        }
      }}
      className="group cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-2xl transition-transform duration-200 active:scale-[0.98]"
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

        {/* Top Badges (原创, 新片) exactly as on huangguoai.com */}
        <div className="absolute top-2 left-2 flex items-center gap-1 z-10 pointer-events-none">
          {(drama.studio?.includes('原创') || drama.category === '黄果原创') && (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-[#ffd21c] text-[#0d0d0d] shadow-sm">
              原创
            </span>
          )}
          {drama.isNew && (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-rose-500 text-white shadow-sm">
              新片
            </span>
          )}
        </div>

        {/* Score Badge at bottom-right matching official .hg-drama-card__score */}
        {Boolean(drama.rating) && (
          <div className="absolute bottom-0 right-0 z-10 pointer-events-none">
            <span className="px-2 py-0.5 rounded-tl-lg bg-gradient-to-r from-[#ffd21c] to-[#ffb800] text-[#0d0d0d] text-[11px] font-extrabold tracking-tight shadow-sm font-mono">
              {drama.rating!.toFixed(1)}分
            </span>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="w-11 h-11 rounded-full bg-amber-500/95 text-[#0B0C10] flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
          </span>
        </div>

        {/* Episode count & views matching official layout */}
        <div className="absolute inset-x-0 bottom-0 p-2.5 pb-2 pointer-events-none">
          <div className="flex items-center gap-1 text-[11px] text-slate-200/95 font-medium tabular-nums drop-shadow">
            <span>
              {drama.status === '已完结'
                ? `全 ${drama.totalEpisodes} 集`
                : `更新至${drama.updatedEpisodes || drama.totalEpisodes}集`}
            </span>
            {drama.playCountLabel && (
              <span className="text-amber-300/90 text-[10px]">· {drama.playCountLabel}</span>
            )}
          </div>
        </div>
      </div>

      <div className={compact ? 'mt-1.5 space-y-1' : 'mt-2 space-y-1'}>
        <h3 className="text-sm font-semibold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
          {drama.title}
        </h3>
        {subtitle ? (
          <p className="text-xs text-slate-400 line-clamp-1">{subtitle}</p>
        ) : (
          /* Official .hg-drama-card__tags style matching huangguoai.com exactly */
          <div className="hg-drama-card__tags flex flex-wrap items-center gap-1 overflow-hidden h-5">
            {drama.genres.slice(0, 3).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTag?.(tag);
                }}
                title={`查看 ${tag} 短剧`}
                className="hg-tag px-1.5 py-0.5 rounded-[3px] text-[10px] font-normal leading-[14px] bg-[#ffd21c]/10 text-[#ffd21c] border border-[#ffd21c]/25 hover:bg-[#ffd21c]/25 hover:border-[#ffd21c]/50 transition-colors shrink-0"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
