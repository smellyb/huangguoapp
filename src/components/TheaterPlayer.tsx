import Hls from 'hls.js';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent,
} from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Captions,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Film,
  Gauge,
  Heart,
  Layers,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  MoreHorizontal,
  Pause,
  Play,
  Ratio,
  RefreshCw,
  RotateCw,
  Share2,
  Smartphone,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import { EqualizerBars } from './player/EqualizerBars';
import { FloatingHearts, type HeartBubble } from './player/FloatingHearts';
import {
  SpeedBoostHUD,
  VerticalSliderHUD,
  SeekHUD,
  SwipePeekIndicator,
} from './player/PlayerHUDs';
import { episodeLikeKey } from '../hooks/useUserLibrary';
import { cleanCoverUrl, fetchEpisodePlayback } from '../services/dramaApi';
import { decryptCoverImage, getCachedDecryptedUrl } from '../services/imageDecryptor';
import {
  cancelPendingPreloads,
  isEpisodeWarmed,
  preloadNextEpisode,
} from '../services/preloadManager';
import { Capacitor } from '@capacitor/core';
import Media3Player, { isNativeMedia3Available } from '../plugins/media3Player';
import type {
  CdnAuthConfig,
  Drama,
  Episode,
  PlaybackRate,
  QualityPreference,
  SubtitleCue,
} from '../types/drama';

const PLAYBACK_RATES: PlaybackRate[] = [0.75, 1, 1.25, 1.5, 2];
const QUALITY_OPTIONS: { value: QualityPreference; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: '1080p', label: '1080P' },
  { value: '720p', label: '720P' },
  { value: '480p', label: '480P' },
];

type FitMode = 'auto' | 'contain' | 'cover';

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatLikes(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return String(count);
}

interface ProgressOverlayProps {
  currentTime: number;
  duration: number;
  bufferedRatio: number;
  subtitlesEnabled: boolean;
  subtitles: SubtitleCue[];
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
  showControls: boolean;
  compactPortrait?: boolean;
  isRotated90?: boolean;
}

const PlayerProgressOverlay = memo(function PlayerProgressOverlay({
  currentTime,
  duration,
  bufferedRatio,
  subtitlesEnabled,
  subtitles,
  isPlaying,
  onSeek,
  showControls,
  compactPortrait = false,
  isRotated90 = false,
}: ProgressOverlayProps) {
  const [scrubbingTime, setScrubbingTime] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const latestScrubTimeRef = useRef<number | null>(null);

  const activeSubtitle = useMemo(() => {
    if (!subtitlesEnabled || subtitles.length === 0) return '';
    const cue = subtitles.find(
      (item) => currentTime >= item.start && currentTime <= item.end
    );
    return cue?.text ?? '';
  }, [subtitlesEnabled, subtitles, currentTime]);

  const resolveTimeFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return currentTime;
      const rect = track.getBoundingClientRect();
      // When inside a clockwise 90deg CSS-rotated stage, visual left->right maps to physical top->bottom
      const ratio = isRotated90
        ? rect.height > 0
          ? (clientY - rect.top) / rect.height
          : 0
        : rect.width > 0
          ? (clientX - rect.left) / rect.width
          : 0;
      const clamped = Math.max(0, Math.min(1, ratio));
      return clamped * duration;
    },
    [currentTime, duration, isRotated90]
  );

  const handleTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      isDraggingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      const next = resolveTimeFromPoint(e.clientX, e.clientY);
      latestScrubTimeRef.current = next;
      setScrubbingTime(next);
    },
    [resolveTimeFromPoint]
  );

  const handleTrackPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || activePointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      const next = resolveTimeFromPoint(e.clientX, e.clientY);
      latestScrubTimeRef.current = next;
      setScrubbingTime(next);
    },
    [resolveTimeFromPoint]
  );

  const handleTrackPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || activePointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const finalTime =
        latestScrubTimeRef.current ?? resolveTimeFromPoint(e.clientX, e.clientY);
      latestScrubTimeRef.current = null;
      setScrubbingTime(null);
      onSeek(finalTime);
    },
    [onSeek, resolveTimeFromPoint]
  );

  const handleTrackKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        onSeek(Math.min(duration, currentTime + 5));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 5));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onSeek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onSeek(duration);
      }
    },
    [currentTime, duration, onSeek]
  );

  const displayTime = scrubbingTime ?? currentTime;
  const progressPercent =
    duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const bufferedPercent = Math.min(
    100,
    Math.max(progressPercent, bufferedRatio * 100)
  );
  const isExpanded = scrubbingTime !== null || !isPlaying || !compactPortrait;

  return (
    <div className="space-y-2" data-no-gesture="true">
      {activeSubtitle && (
        <div className="px-2 text-center pointer-events-none">
          <p className="inline-block max-w-[92%] px-3 py-1 rounded-xl bg-black/70 backdrop-blur-sm text-sm font-medium text-white leading-snug">
            {activeSubtitle}
          </p>
        </div>
      )}

      {scrubbingTime !== null && (
        <div className="flex justify-center pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-black/80 border border-white/15 text-xs font-mono tabular-nums text-white">
            <span className="text-amber-400 font-semibold">
              {formatTime(scrubbingTime)}
            </span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-300">{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <div
        className={`transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 40px expanded touch hitbox with rotated-axis coordinate awareness */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(Math.max(duration, 1))}
          aria-valuenow={Math.round(displayTime)}
          aria-valuetext={`${formatTime(displayTime)} / ${formatTime(duration)}`}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerEnd}
          onPointerCancel={handleTrackPointerEnd}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onKeyDown={handleTrackKeyDown}
          className="relative h-10 flex items-center cursor-pointer touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 rounded-lg"
        >
          <div
            className={`w-full rounded-full bg-white/25 overflow-hidden transition-all duration-150 pointer-events-none ${
              isExpanded ? 'h-1.5' : 'h-[3px]'
            }`}
          >
            <div
              className="h-full bg-white/35 transition-[width] duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
          <div
            className={`absolute left-0 rounded-full bg-amber-400 pointer-events-none transition-all duration-75 ${
              isExpanded ? 'h-1.5' : 'h-[3px]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
          {isExpanded && (
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-amber-400 pointer-events-none -translate-x-1/2"
              style={{ left: `${progressPercent}%` }}
            />
          )}
        </div>

        {isExpanded && (
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300/90 -mt-1.5">
            <span>{formatTime(displayTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        )}
      </div>
    </div>
  );
});

interface EpisodePanelProps {
  drama: Drama;
  currentEpisodeNumber: number;
  watchedMaxEpisode: number;
  onSelectEpisode: (epNum: number) => void;
  onClose?: () => void;
  onSelectTag?: (tag: string) => void;
}

const EpisodeSelectorGrid = memo(function EpisodeSelectorGrid({
  drama,
  currentEpisodeNumber,
  watchedMaxEpisode,
  onSelectEpisode,
  onClose,
}: EpisodePanelProps) {
  const chunkSize = 30;
  const totalChunks = Math.ceil(drama.episodes.length / chunkSize);
  const initialChunk = Math.floor((currentEpisodeNumber - 1) / chunkSize);
  const [chunkIndex, setChunkIndex] = useState(initialChunk);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setChunkIndex(Math.floor((currentEpisodeNumber - 1) / chunkSize));
  }, [drama.id, currentEpisodeNumber]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [currentEpisodeNumber, chunkIndex]);

  const visibleEpisodes = useMemo(() => {
    const start = chunkIndex * chunkSize;
    return drama.episodes.slice(start, start + chunkSize);
  }, [drama.episodes, chunkIndex]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white truncate">
            {drama.title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {drama.status === '已完结'
              ? `全 ${drama.totalEpisodes} 集`
              : `更至 ${drama.updatedEpisodes} / ${drama.totalEpisodes} 集`}{' '}
            <span aria-hidden="true">·</span> {drama.category}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭选集"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {totalChunks > 1 && (
        <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
          {Array.from({ length: totalChunks }).map((_, idx) => {
            const start = idx * chunkSize + 1;
            const end = Math.min((idx + 1) * chunkSize, drama.episodes.length);
            const active = chunkIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setChunkIndex(idx)}
                className={`min-h-[36px] px-3.5 rounded-xl text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-amber-500 text-[#0B0C10] border-amber-400 font-bold'
                    : 'bg-white/[0.06] text-slate-300 border-transparent hover:text-white hover:bg-white/10'
                }`}
              >
                {start}-{end}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-5 gap-2.5 py-3 overflow-y-auto no-scrollbar">
        {visibleEpisodes.map((ep) => {
          const isCurrent = ep.number === currentEpisodeNumber;
          const isWatched = ep.number < watchedMaxEpisode && !isCurrent;
          return (
            <button
              key={ep.number}
              ref={isCurrent ? activeItemRef : undefined}
              type="button"
              onClick={() => {
                onSelectEpisode(ep.number);
                onClose?.();
              }}
              className={`min-h-[48px] rounded-xl font-mono text-sm tabular-nums transition-all flex flex-col items-center justify-center relative border active:scale-95 ${
                isCurrent
                  ? 'bg-amber-500 text-[#0B0C10] border-amber-300 font-bold'
                  : isWatched
                    ? 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:border-amber-500/40 hover:text-white'
                    : 'bg-[#1D202A] text-slate-100 border-white/[0.08] hover:border-amber-500/50 hover:text-amber-300'
              }`}
            >
              <span>{ep.number}</span>
              {isCurrent && (
                <EqualizerBars
                  active={true}
                  colorClass="bg-[#0B0C10]"
                  className="mt-0.5 scale-90"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface TheaterPlayerProps {
  dramas: Drama[];
  drama: Drama;
  episodeNumber: number;
  initialTimeSeconds?: number;
  followedIds: string[];
  likedEpisodeKeys: string[];
  preferredQuality: QualityPreference;
  apiBaseUrl?: string;
  currentLineLabel?: string;
  onExitTheater?: () => void;
  onPushHistoryLayer?: (layer: string) => void;
  overlayBackHandlerRef?: MutableRefObject<(() => boolean) | null>;
  onChangeQuality: (quality: QualityPreference) => void;
  onSelectDramaEpisode: (
    dramaId: string,
    episodeNumber: number,
    resumeAt?: number
  ) => void;
  onSelectTag?: (tag: string) => void;
  onToggleFollow: (dramaId: string) => void;
  onToggleLike: (dramaId: string, episodeNumber: number) => void;
  onRecordProgress: (
    dramaId: string,
    episodeNumber: number,
    progressSeconds: number,
    durationSeconds: number,
    immediate?: boolean
  ) => void;
  onNotify: (message: string) => void;
  onOpenLineSelector?: () => void;
}

export function TheaterPlayer({
  dramas,
  drama,
  episodeNumber,
  initialTimeSeconds = 0,
  followedIds,
  likedEpisodeKeys,
  preferredQuality,
  apiBaseUrl,
  currentLineLabel,
  onExitTheater,
  onPushHistoryLayer,
  overlayBackHandlerRef,
  onChangeQuality,
  onSelectDramaEpisode,
  onSelectTag,
  onToggleFollow,
  onToggleLike,
  onRecordProgress,
  onNotify,
  onOpenLineSelector,
}: TheaterPlayerProps) {
  const episode: Episode = useMemo(
    () =>
      drama.episodes.find((ep) => ep.number === episodeNumber) ??
      drama.episodes[0],
    [drama, episodeNumber]
  );

  const nextEpisode = useMemo(
    () => drama.episodes.find((ep) => ep.number === episode.number + 1),
    [drama, episode.number]
  );

  const [resolvedHlsUrl, setResolvedHlsUrl] = useState<string | undefined>(episode.hlsUrl);
  const [resolvedCdn, setResolvedCdn] = useState<CdnAuthConfig | undefined>(episode.cdn);
  const [useFallbackPlayback, setUseFallbackPlayback] = useState(false);

  useEffect(() => {
    setUseFallbackPlayback(false);
  }, [drama.id, episode.number]);

  const activeHlsUrl = useFallbackPlayback ? undefined : (episode.hlsUrl || resolvedHlsUrl);
  const activeCdn = episode.cdn || resolvedCdn;
  const hasExternalStream = Boolean(activeHlsUrl || (!useFallbackPlayback && episode.videoUrl));

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(initialTimeSeconds);
  const [duration, setDuration] = useState(episode.durationSeconds);
  const [bufferedRatio, setBufferedRatio] = useState(hasExternalStream ? 0 : 1);
  const [videoReady, setVideoReady] = useState(!hasExternalStream);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showEpisodeSheet, setShowEpisodeSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [preloadTriggered, setPreloadTriggered] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // Resolve remote HLS stream URL if needed
  useEffect(() => {
    let active = true;

    if (episode.hlsUrl) {
      setResolvedHlsUrl(episode.hlsUrl);
      if (episode.cdn) setResolvedCdn(episode.cdn);
      setStreamError(null);
      return;
    }

    if (apiBaseUrl) {
      setIsBuffering(true);
      setStreamError(null);

      fetchEpisodePlayback(apiBaseUrl, drama.id, episode.number)
        .then((info) => {
          if (!active) return;
          if (info?.streamUrl) {
            episode.hlsUrl = info.streamUrl;
            if (info.cdn) episode.cdn = info.cdn;
            setResolvedHlsUrl(info.streamUrl);
            setResolvedCdn(info.cdn);
            setStreamError(null);
          } else {
            setResolvedHlsUrl(undefined);
            setResolvedCdn(undefined);
            setStreamError('当前线路未能获取到有效视频流，建议切换极速线路或使用剧照预览播放。');
          }
        })
        .catch((err) => {
          if (!active) return;
          setResolvedHlsUrl(undefined);
          setResolvedCdn(undefined);
          const msg = err instanceof Error ? err.message : '网络请求失败';
          setStreamError(`视频流解析受阻（${msg}），建议切换极速线路或使用剧照预览播放。`);
        })
        .finally(() => {
          if (active) setIsBuffering(false);
        });

      return () => {
        active = false;
      };
    } else {
      setResolvedHlsUrl(undefined);
      setResolvedCdn(undefined);
    }
  }, [apiBaseUrl, drama.id, episode, retryToken]);

  // Native Media3 (AndroidX ExoPlayer) Availability Check
  const isCapacitor = useMemo(() => Capacitor.isNativePlatform(), []);
  const useNativeMedia3 = useMemo(() => isNativeMedia3Available(), []);

  // Fullscreen & Landscape Cinema Modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [isDeviceLandscape, setIsDeviceLandscape] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>('auto');
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [hudVisible, setHudVisible] = useState(true);

  // Gestures & Floating Overlays
  const [hearts, setHearts] = useState<HeartBubble[]>([]);
  const [isSpeedBoosting, setIsSpeedBoosting] = useState(false);
  const [brightness, setBrightness] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isAdjustingBrightness, setIsAdjustingBrightness] = useState(false);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [isDraggingEpisode, setIsDraggingEpisode] = useState(false);
  const [seekHUD, setSeekHUD] = useState<{
    visible: boolean;
    targetTime: number;
    deltaSeconds: number;
  } | null>(null);

  const [isCleanMode, setIsCleanMode] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const stallAttemptsRef = useRef(0);
  const currentTimeRef = useRef(initialTimeSeconds);
  const hudTimerRef = useRef<number | null>(null);
  const landscapeUsedFullscreenRef = useRef(false);

  // Gesture state refs
  const touchStartRef = useRef<{
    x: number;
    y: number;
    startLocalX: number;
    time: number;
    stageW: number;
    stageH: number;
    startBrightness: number;
    startVolume: number;
    startSeekTime: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapPosRef = useRef({ x: 0, y: 0 });
  const lastTouchHandledAtRef = useRef(0);
  const brightnessTimerRef = useRef<number | null>(null);
  const volumeTimerRef = useRef<number | null>(null);
  const gestureTypeRef = useRef<
    'none' | 'long_press' | 'seek' | 'brightness' | 'volume' | 'swipe'
  >('none');

  const isFollowed = followedIds.includes(drama.id);
  const isLiked = likedEpisodeKeys.includes(
    episodeLikeKey(drama.id, episode.number)
  );
  const likeCount = drama.likesBase + (isLiked ? 1 : 0);

  useEffect(() => {
    const updateViewportState = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortraitMobile(w < 768 && h > w);
      setIsDeviceLandscape(w > h && (isCapacitor || h <= 720));
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);
    window.addEventListener('orientationchange', updateViewportState);
    return () => {
      window.removeEventListener('resize', updateViewportState);
      window.removeEventListener('orientationchange', updateViewportState);
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      if (!active) {
        setIsFullscreen(false);
        if (landscapeUsedFullscreenRef.current) {
          landscapeUsedFullscreenRef.current = false;
          setIsLandscape(false);
          try {
            (
              screen.orientation as ScreenOrientation & { unlock?: () => void }
            )?.unlock?.();
          } catch {
            // Ignore
          }
        }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setStageSize({
        w: el.clientWidth || window.innerWidth,
        h: el.clientHeight || window.innerHeight,
      });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isFullscreen, isLandscape, isPortraitMobile, isDeviceLandscape]);

  const effectiveLandscape = isLandscape || isDeviceLandscape;
  // On native Android with Media3, rotation is handled at the Activity window level;
  // CSS 90deg fallback engages ONLY in web/fallback when native orientation lock cannot rotate viewport.
  const isRotatedMobileLandscape = !useNativeMedia3 && isLandscape && isPortraitMobile;
  const isImmersiveLandscape =
    effectiveLandscape && (isCapacitor || window.innerWidth <= 1024 || isDeviceLandscape || isFullscreen);
  const isImmersiveOverlay =
    isFullscreen || isRotatedMobileLandscape || isDeviceLandscape;

  const isLandscapeMedia = mediaAspectRatio !== null && mediaAspectRatio > 1.05;
  const effectiveFit: 'contain' | 'cover' =
    fitMode === 'auto'
      ? isLandscapeMedia || effectiveLandscape
        ? 'contain'
        : 'cover'
      : fitMode;
  const mediaFitClass = effectiveFit === 'contain' ? 'object-contain' : 'object-cover';

  // Lock body scroll on mobile theater & immersive overlays so background never bounces
  useEffect(() => {
    if (!isImmersiveOverlay && !isPortraitMobile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isImmersiveOverlay, isPortraitMobile]);

  // Auto-hide HUD ONLY in landscape/fullscreen mode.
  // In portrait HongGuo/TikTok mode, the clean lightweight overlay stays accessible
  // so users never have to double-tap just to pause or find episodes (Clean Mode hides all).
  const pokeHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }

    if (
      (effectiveLandscape || isFullscreen) &&
      isPlaying &&
      !showEpisodeSheet &&
      !showMoreSheet &&
      !isSpeedBoosting
    ) {
      hudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 3200);
    }
  }, [
    effectiveLandscape,
    isFullscreen,
    isPlaying,
    showEpisodeSheet,
    showMoreSheet,
    isSpeedBoosting,
  ]);

  useEffect(() => {
    if (
      (!effectiveLandscape && !isFullscreen) ||
      !isPlaying ||
      showEpisodeSheet ||
      showMoreSheet
    ) {
      setHudVisible(true);
      if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
      return;
    }

    pokeHud();
    return () => {
      if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    };
  }, [
    effectiveLandscape,
    isFullscreen,
    isPlaying,
    pokeHud,
    showEpisodeSheet,
    showMoreSheet,
  ]);

  const toggleFullscreen = useCallback(async () => {
    setShowMoreSheet(false);

    if (isFullscreen) {
      landscapeUsedFullscreenRef.current = false;
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      try {
        (
          screen.orientation as ScreenOrientation & { unlock?: () => void }
        )?.unlock?.();
      } catch {
        // Ignore
      }
      setIsFullscreen(false);
      onNotify('已退出全屏');
      return;
    }

    setIsFullscreen(true);
    onPushHistoryLayer?.('fullscreen');
    if (stageRef.current?.requestFullscreen) {
      try {
        await stageRef.current.requestFullscreen();
      } catch {
        // Keep CSS full-viewport fullscreen active
      }
    }
    onNotify('已进入全屏模式');
  }, [isFullscreen, onNotify, onPushHistoryLayer]);

  const toggleLandscape = useCallback(async () => {
    setShowMoreSheet(false);
    const next = !isLandscape;
    setHudVisible(true);

    const orientationApi = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
      unlock?: () => void;
    };

    if (next) {
      setIsLandscape(true);
      onPushHistoryLayer?.('landscape');

      if (isNativeMedia3Available()) {
        try {
          await Media3Player.setOrientation({ orientation: 'landscape' });
        } catch (e) {
          console.warn('Native orientation lock failed', e);
        }
      } else if (isPortraitMobile) {
        let enteredNativeFs = false;
        if (stageRef.current?.requestFullscreen && !document.fullscreenElement) {
          try {
            await stageRef.current.requestFullscreen();
            enteredNativeFs = Boolean(document.fullscreenElement);
          } catch {
            enteredNativeFs = false;
          }
        }

        let lockedNativeLandscape = false;
        if (orientationApi?.lock) {
          try {
            await orientationApi.lock('landscape');
            lockedNativeLandscape = true;
          } catch {
            lockedNativeLandscape = false;
          }
        }

        if (lockedNativeLandscape) {
          landscapeUsedFullscreenRef.current = enteredNativeFs;
          if (enteredNativeFs) setIsFullscreen(true);
        } else if (enteredNativeFs && document.fullscreenElement) {
          landscapeUsedFullscreenRef.current = false;
          await document.exitFullscreen().catch(() => undefined);
          setIsFullscreen(false);
        }
      } else if (orientationApi?.lock) {
        try {
          await orientationApi.lock('landscape');
        } catch {
          // Desktop / wide viewport renders widescreen cinema stage
        }
      }

      onNotify('已切换横屏全屏');
    } else {
      landscapeUsedFullscreenRef.current = false;
      setIsLandscape(false);
      setIsFullscreen(false);
      if (isNativeMedia3Available()) {
        try {
          await Media3Player.setOrientation({ orientation: 'portrait' });
        } catch (e) {
          console.warn('Native orientation reset failed', e);
        }
      }
      try {
        orientationApi?.unlock?.();
      } catch {
        // Ignore
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      onNotify('已恢复竖屏刷剧');
    }
  }, [isLandscape, isPortraitMobile, onNotify, onPushHistoryLayer]);

  // Register unified mobile back-button dismissal priority:
  // More Sheet -> Episode Sheet -> Landscape (also exits paired fullscreen) -> Fullscreen -> let App exit Theater
  useEffect(() => {
    if (!overlayBackHandlerRef) return;
    overlayBackHandlerRef.current = () => {
      if (showMoreSheet) {
        setShowMoreSheet(false);
        return true;
      }
      if (showEpisodeSheet) {
        setShowEpisodeSheet(false);
        return true;
      }
      if (isLandscape) {
        void toggleLandscape();
        return true;
      }
      if (isFullscreen) {
        void toggleFullscreen();
        return true;
      }
      return false;
    };
    return () => {
      overlayBackHandlerRef.current = null;
    };
  }, [
    isFullscreen,
    isLandscape,
    overlayBackHandlerRef,
    showEpisodeSheet,
    showMoreSheet,
    toggleFullscreen,
    toggleLandscape,
  ]);

  const openEpisodeSheet = useCallback(() => {
    setShowEpisodeSheet(true);
    onPushHistoryLayer?.('episode-sheet');
  }, [onPushHistoryLayer]);

  const openMoreSheet = useCallback(() => {
    setShowMoreSheet(true);
    onPushHistoryLayer?.('more-sheet');
  }, [onPushHistoryLayer]);

  const cyclePlaybackRate = useCallback(() => {
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(nextRate);
    if (useNativeMedia3) {
      Media3Player.setSpeed({ speed: nextRate }).catch(() => null);
    }
    onNotify(`播放倍速：${nextRate}x`);
  }, [playbackRate, onNotify, useNativeMedia3]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    setFitMode('auto');
  }, [drama.id]);

  useEffect(() => {
    const startSec =
      initialTimeSeconds > 0 && initialTimeSeconds < episode.durationSeconds - 3
        ? initialTimeSeconds
        : 0;
    setCurrentTime(startSec);
    currentTimeRef.current = startSec;
    setDuration(episode.durationSeconds);
    setMediaAspectRatio(null);
    setStreamError(null);
    setIsBuffering(false);
    setPreloadTriggered(isEpisodeWarmed(drama.id, episode.number + 1));
    setVideoReady(!hasExternalStream);
    setBufferedRatio(hasExternalStream ? 0 : 1);
    setIsPlaying(true);
    stallAttemptsRef.current = 0;

    return () => {
      onRecordProgress(
        drama.id,
        episode.number,
        currentTimeRef.current,
        episode.durationSeconds,
        true
      );
    };
  }, [
    drama.id,
    episode.number,
    episode.durationSeconds,
    hasExternalStream,
    initialTimeSeconds,
    onRecordProgress,
  ]);

  useEffect(() => {
    if (!nextEpisode || preloadTriggered) return;
    const ratio = duration > 0 ? currentTime / duration : 0;
    const remaining = duration - currentTime;
    if (ratio >= 0.4 || (duration > 15 && remaining <= 20)) {
      preloadNextEpisode(drama.id, nextEpisode, apiBaseUrl);
      setPreloadTriggered(true);
    }
  }, [apiBaseUrl, currentTime, duration, drama.id, nextEpisode, preloadTriggered]);

  useEffect(() => {
    return () => {
      cancelPendingPreloads();
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const handleNextEpisodeOrDrama = useCallback(() => {
    if (nextEpisode) {
      onSelectDramaEpisode(drama.id, nextEpisode.number, 0);
      onNotify(`第 ${nextEpisode.number} 集`);
      return;
    }

    const currentIdx = dramas.findIndex((item) => item.id === drama.id);
    const nextDrama = dramas[(currentIdx + 1) % dramas.length];
    if (nextDrama && nextDrama.id !== drama.id) {
      onSelectDramaEpisode(nextDrama.id, 1, 0);
      onNotify(`切换至《${nextDrama.title}》`);
    }
  }, [drama.id, dramas, nextEpisode, onNotify, onSelectDramaEpisode]);

  const handlePrevEpisodeOrDrama = useCallback(() => {
    if (episode.number > 1) {
      onSelectDramaEpisode(drama.id, episode.number - 1, 0);
      onNotify(`第 ${episode.number - 1} 集`);
      return;
    }
    const currentIdx = dramas.findIndex((item) => item.id === drama.id);
    const prevDrama = dramas[(currentIdx - 1 + dramas.length) % dramas.length];
    if (prevDrama && prevDrama.id !== drama.id) {
      onSelectDramaEpisode(prevDrama.id, 1, 0);
      onNotify(`切换至《${prevDrama.title}》`);
    }
  }, [drama.id, dramas, episode.number, onNotify, onSelectDramaEpisode]);

  // Native Media3 (AndroidX ExoPlayer) playback lifecycle for hardware-accelerated playback
  useEffect(() => {
    if (!useNativeMedia3 || !hasExternalStream) return;
    const streamUrl = activeHlsUrl || episode.videoUrl;
    if (!streamUrl) return;

    const headers: Record<string, string> = {};
    const cdn = activeCdn || episode.cdn;
    if (cdn?.authKey && cdn.authValue) {
      headers[cdn.authKey] = cdn.authValue;
    }
    if (cdn?.app) {
      headers['x-cdn-app'] = cdn.app;
    }

    let active = true;

    Media3Player.initPlayer({
      streamUrl,
      autoPlay: isPlaying,
      startSeconds: initialTimeSeconds > 0 ? initialTimeSeconds : 0,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      resizeMode: effectiveFit === 'cover' ? 'zoom' : 'fit',
    }).catch((err) => {
      if (active) {
        console.warn('[TheaterPlayer] Media3 init failed:', err);
      }
    });

    const subState = Media3Player.addListener('playbackStateChanged', (ev) => {
      if (!active) return;
      if (ev.state === 'buffering') {
        setIsBuffering(true);
      } else if (ev.state === 'ready') {
        setIsBuffering(false);
        setVideoReady(true);
        setStreamError(null);
      } else if (ev.state === 'ended') {
        setIsPlaying(false);
        if (autoAdvance) {
          handleNextEpisodeOrDrama();
        }
      }
    });

    const subPlay = Media3Player.addListener('isPlayingChanged', (ev) => {
      if (!active) return;
      setIsPlaying(ev.isPlaying);
    });

    const subTime = Media3Player.addListener('timeUpdate', (ev) => {
      if (!active) return;
      setCurrentTime(ev.currentTime);
      currentTimeRef.current = ev.currentTime;
      if (ev.duration > 0) {
        setDuration(ev.duration);
        setBufferedRatio(ev.bufferedPosition / ev.duration);
      }
      onRecordProgress(
        drama.id,
        episode.number,
        ev.currentTime,
        ev.duration || episode.durationSeconds,
        false
      );
    });

    const subSize = Media3Player.addListener('videoSizeChanged', (ev) => {
      if (!active) return;
      if (ev.width > 0 && ev.height > 0) {
        setMediaAspectRatio(ev.width / ev.height);
      }
    });

    const subErr = Media3Player.addListener('playerError', (ev) => {
      if (!active) return;
      setIsBuffering(false);
      setStreamError(`原生播放异常（${ev.message}），建议切换其他线路。`);
    });

    return () => {
      active = false;
      subState.then((h) => h.remove());
      subPlay.then((h) => h.remove());
      subTime.then((h) => h.remove());
      subSize.then((h) => h.remove());
      subErr.then((h) => h.remove());
    };
  }, [
    useNativeMedia3,
    hasExternalStream,
    activeHlsUrl,
    episode.videoUrl,
    activeCdn,
    episode.cdn,
    drama.id,
    episode.number,
    episode.durationSeconds,
    initialTimeSeconds,
    autoAdvance,
    handleNextEpisodeOrDrama,
    onRecordProgress,
    retryToken,
  ]);

  // Cleanup native player and reset orientation on unmount
  useEffect(() => {
    return () => {
      if (useNativeMedia3) {
        Media3Player.setOrientation({ orientation: 'portrait' }).catch(() => null);
        Media3Player.destroy().catch(() => null);
      }
    };
  }, [useNativeMedia3]);

  // Synchronize effectiveFit resize mode to native Media3 player
  useEffect(() => {
    if (useNativeMedia3) {
      Media3Player.setResizeMode({
        mode: effectiveFit === 'cover' ? 'zoom' : 'fit',
      }).catch(() => null);
    }
  }, [effectiveFit, useNativeMedia3]);

  // HLS / MP4 playback lifecycle (Web / Hls.js fallback)
  useEffect(() => {
    if (!hasExternalStream || useNativeMedia3) return;
    const video = videoRef.current;
    if (!video) return;

    const hlsUrl = activeHlsUrl;
    const mp4Url = episode.videoUrl;

    const applyInitialSeek = () => {
      if (
        initialTimeSeconds > 0 &&
        video.duration &&
        initialTimeSeconds < video.duration - 2
      ) {
        video.currentTime = initialTimeSeconds;
      }
      video.playbackRate = playbackRate;
      video.muted = isMuted;
      if (isPlaying) {
        video.play().catch(() => {
          setIsPlaying(false);
        });
      }
    };

    if (hlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 10,
        startFragPrefetch: true,
        capLevelToPlayerSize: true,
        fragLoadingTimeOut: 10000,
        manifestLoadingTimeOut: 8000,
        xhrSetup: (xhr, url) => {
          const cdn = activeCdn || episode.cdn;
          if (cdn?.authKey && cdn.authValue) {
            const path = String(url || '').split(/[?#]/)[0];
            const isM3u8 = /\.m3u8$/i.test(path);
            const isOther = /\.(?:ts|m4s|key)$/i.test(path);
            if (
              (isM3u8 && cdn.m3u8Enabled !== false) ||
              (isOther && cdn.otherEnabled)
            ) {
              try {
                xhr.setRequestHeader(cdn.authKey, cdn.authValue);
                if (cdn.app) xhr.setRequestHeader('x-cdn-app', cdn.app);
              } catch {
                // Ignore
              }
            }
          }
        },
      });

      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyInitialSeek();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        stallAttemptsRef.current += 1;

        if (
          data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          stallAttemptsRef.current <= 2
        ) {
          setIsBuffering(true);
          hls.startLoad();
          return;
        }

        if (
          data.type === Hls.ErrorTypes.MEDIA_ERROR &&
          stallAttemptsRef.current <= 2
        ) {
          setIsBuffering(true);
          hls.recoverMediaError();
          return;
        }

        if (hls.levels.length > 1 && hls.currentLevel > 0) {
          hls.currentLevel = Math.max(0, hls.currentLevel - 1);
          hls.startLoad();
          onNotify('网络波动，已自动切换流畅画质');
          return;
        }

        setIsBuffering(false);
        setStreamError('视频流加载受阻，建议切换其他直连线路或使用剧照预览播放。');
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (hlsUrl && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
    } else if (mp4Url) {
      video.src = mp4Url;
    }

    const onLoadedMeta = () => applyInitialSeek();
    video.addEventListener('loadedmetadata', onLoadedMeta);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeAttribute('src');
      video.load();
    };
  }, [activeHlsUrl, episode.videoUrl, hasExternalStream, retryToken]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || hls.levels.length === 0) return;

    if (preferredQuality === 'auto') {
      hls.currentLevel = -1;
      return;
    }

    const targetHeight =
      preferredQuality === '1080p'
        ? 1080
        : preferredQuality === '720p'
          ? 720
          : 480;
    let bestIdx = 0;
    let minDiff = Infinity;
    hls.levels.forEach((lvl, idx) => {
      const diff = Math.abs((lvl.height || 720) - targetHeight);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });
    hls.currentLevel = bestIdx;
  }, [preferredQuality]);

  useEffect(() => {
    if (!hasExternalStream) return;
    if (useNativeMedia3) {
      if (isPlaying) {
        Media3Player.play().catch(() => setIsPlaying(false));
      } else {
        Media3Player.pause().catch(() => null);
      }
      Media3Player.setSpeed({ speed: isSpeedBoosting ? 2.0 : playbackRate }).catch(() => null);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = isSpeedBoosting ? 2.0 : playbackRate;
    video.muted = isMuted;
    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [hasExternalStream, isPlaying, playbackRate, isMuted, isSpeedBoosting, useNativeMedia3]);

  // Built-in GPU storyboard playback clock
  useEffect(() => {
    if (hasExternalStream || !isPlaying) return;

    const effectiveRate = isSpeedBoosting ? 2.0 : playbackRate;
    const intervalMs = 250;
    const timer = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + (intervalMs / 1000) * effectiveRate;
        if (next >= duration) {
          window.clearInterval(timer);
          onRecordProgress(drama.id, episode.number, duration, duration, true);
          if (autoAdvance) {
            window.setTimeout(() => handleNextEpisodeOrDrama(), 200);
          } else {
            setIsPlaying(false);
          }
          return duration;
        }
        onRecordProgress(drama.id, episode.number, next, duration, false);
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    autoAdvance,
    drama.id,
    duration,
    episode.number,
    handleNextEpisodeOrDrama,
    hasExternalStream,
    isPlaying,
    isSpeedBoosting,
    onRecordProgress,
    playbackRate,
  ]);

  const handleSeek = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      currentTimeRef.current = seconds;
      if (useNativeMedia3) {
        Media3Player.seekTo({ seconds }).catch(() => null);
      } else if (hasExternalStream && videoRef.current) {
        videoRef.current.currentTime = seconds;
      }
      onRecordProgress(drama.id, episode.number, seconds, duration, true);
      pokeHud();
    },
    [drama.id, duration, episode.number, hasExternalStream, onRecordProgress, pokeHud, useNativeMedia3]
  );

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (useNativeMedia3) {
        if (next) {
          Media3Player.play().catch(() => null);
        } else {
          Media3Player.pause().catch(() => null);
        }
      } else if (!next) {
        onRecordProgress(
          drama.id,
          episode.number,
          currentTimeRef.current,
          duration,
          true
        );
      }
      return next;
    });
    pokeHud();
  }, [drama.id, duration, episode.number, onRecordProgress, pokeHud, useNativeMedia3]);

  // Desktop keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayPause();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        void toggleLandscape();
      } else if (event.key === 'Escape') {
        if (showMoreSheet) {
          setShowMoreSheet(false);
        } else if (showEpisodeSheet) {
          setShowEpisodeSheet(false);
        } else if (isFullscreen && !document.fullscreenElement) {
          setIsFullscreen(false);
          onNotify('已退出全屏');
        } else if (isLandscape) {
          setIsLandscape(false);
          onNotify('已恢复竖屏刷剧');
        }
      } else if (event.code === 'ArrowDown') {
        event.preventDefault();
        handleNextEpisodeOrDrama();
      } else if (event.code === 'ArrowUp') {
        event.preventDefault();
        handlePrevEpisodeOrDrama();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        handleSeek(Math.min(duration, currentTimeRef.current + 5));
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        handleSeek(Math.max(0, currentTimeRef.current - 5));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    duration,
    handleNextEpisodeOrDrama,
    handlePrevEpisodeOrDrama,
    handleSeek,
    isFullscreen,
    isLandscape,
    onNotify,
    showEpisodeSheet,
    showMoreSheet,
    toggleFullscreen,
    toggleLandscape,
    togglePlayPause,
  ]);

  // Conflict-free HongGuo/TikTok Touch Gesture State Machine
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;

    // Never hijack touches on buttons, progress bar, or bottom sheets
    const targetEl = event.target as HTMLElement | null;
    if (
      targetEl?.closest('button, input, a, [role="dialog"], [data-no-gesture="true"]')
    ) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    const stage = stageRef.current;
    const rect = stage?.getBoundingClientRect();
    const stageW = isRotatedMobileLandscape
      ? rect?.height || window.innerHeight
      : rect?.width || window.innerWidth;
    const stageH = isRotatedMobileLandscape
      ? rect?.width || window.innerWidth
      : rect?.height || window.innerHeight;
    const touchX = isRotatedMobileLandscape
      ? touch.clientY - (rect?.top || 0)
      : touch.clientX - (rect?.left || 0);
    const touchY = isRotatedMobileLandscape
      ? (rect?.right || window.innerWidth) - touch.clientX
      : touch.clientY - (rect?.top || 0);

    lastTouchHandledAtRef.current = Date.now();
    pokeHud();

    const now = Date.now();
    const tapInterval = now - lastTapTimeRef.current;
    const dist = Math.hypot(
      touch.clientX - lastTapPosRef.current.x,
      touch.clientY - lastTapPosRef.current.y
    );

    // Double-tap to Like (cancels pending single-tap play/pause cleanly!)
    if (tapInterval < 260 && dist < 38) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      lastTapTimeRef.current = 0;

      const newHeart: HeartBubble = {
        id: Date.now() + Math.random(),
        x: touchX,
        y: touchY,
        rotate: (Math.random() - 0.5) * 30,
      };
      setHearts((prev) => [...prev, newHeart]);
      window.setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
      }, 850);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }

      if (!isLiked) {
        onToggleLike(drama.id, episode.number);
      }
      return;
    }

    lastTapTimeRef.current = now;
    lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };
    gestureTypeRef.current = 'none';

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      startLocalX: touchX,
      time: now,
      stageW,
      stageH,
      startBrightness: brightness,
      startVolume: videoRef.current ? videoRef.current.volume : volume,
      startSeekTime: currentTimeRef.current,
    };

    // Long press > 400ms activates 2.0x speed boost
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      if (gestureTypeRef.current === 'none' && touchStartRef.current) {
        gestureTypeRef.current = 'long_press';
        setIsSpeedBoosting(true);
        if (useNativeMedia3) {
          Media3Player.setSpeed({ speed: 2.0 }).catch(() => null);
        } else if (videoRef.current) {
          videoRef.current.playbackRate = 2.0;
        }
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(18);
        }
      }
    }, 400);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const start = touchStartRef.current;
    const dx = isRotatedMobileLandscape
      ? touch.clientY - start.y
      : touch.clientX - start.x;
    const dy = isRotatedMobileLandscape
      ? start.x - touch.clientX
      : touch.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.hypot(dx, dy) > 10 && longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (gestureTypeRef.current === 'long_press') {
      return;
    }

    // Lock gesture intent:
    // Portrait mode -> ANY vertical swipe switches episodes (zero accidental brightness/volume conflict!)
    // Landscape/Fullscreen -> Left 30% brightness, Right 30% volume, Center 40% episode swipe
    if (gestureTypeRef.current === 'none') {
      if (absDx > 16 && absDx > absDy * 1.25) {
        gestureTypeRef.current = 'seek';
      } else if (absDy > 14 && absDy > absDx * 1.15) {
        if (start.startLocalX < start.stageW * 0.3) {
          gestureTypeRef.current = 'brightness';
        } else if (start.startLocalX > start.stageW * 0.7) {
          gestureTypeRef.current = 'volume';
        } else {
          gestureTypeRef.current = 'swipe';
        }
      }
    }

    if (gestureTypeRef.current === 'seek') {
      const deltaSec = (dx / start.stageW) * Math.min(90, Math.max(30, duration * 0.45));
      const targetTime = Math.max(0, Math.min(duration, start.startSeekTime + deltaSec));
      setSeekHUD({
        visible: true,
        targetTime,
        deltaSeconds: deltaSec,
      });
    } else if (gestureTypeRef.current === 'brightness') {
      const nextB = Math.max(
        0.2,
        Math.min(1.0, start.startBrightness - (dy / start.stageH) * 1.2)
      );
      setBrightness(nextB);
      setIsAdjustingBrightness(true);
      if (brightnessTimerRef.current) window.clearTimeout(brightnessTimerRef.current);
    } else if (gestureTypeRef.current === 'volume') {
      const nextV = Math.max(
        0,
        Math.min(1.0, start.startVolume - (dy / start.stageH) * 1.2)
      );
      setVolume(nextV);
      setIsAdjustingVolume(true);
      if (useNativeMedia3) {
        Media3Player.setVolume({ volume: nextV }).catch(() => null);
        if (nextV > 0 && isMuted) setIsMuted(false);
      } else if (videoRef.current) {
        videoRef.current.volume = nextV;
        if (nextV > 0 && isMuted) setIsMuted(false);
      }
      if (volumeTimerRef.current) window.clearTimeout(volumeTimerRef.current);
    } else if (gestureTypeRef.current === 'swipe') {
      setIsDraggingEpisode(true);
      const isTopBoundary = episode.number <= 1 && dy > 0;
      const isBottomBoundary =
        episode.number >= drama.episodes.length && dramas.length <= 1 && dy < 0;
      const effectiveDy = isTopBoundary || isBottomBoundary ? dy * 0.28 : dy * 0.78;
      setDragDeltaY(effectiveDy);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const start = touchStartRef.current;
    const gType = gestureTypeRef.current;

    if (gType === 'long_press') {
      setIsSpeedBoosting(false);
      if (useNativeMedia3) {
        Media3Player.setSpeed({ speed: playbackRate }).catch(() => null);
      } else if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gType === 'seek') {
      if (seekHUD) {
        handleSeek(seekHUD.targetTime);
        setSeekHUD(null);
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gType === 'brightness') {
      brightnessTimerRef.current = window.setTimeout(() => {
        setIsAdjustingBrightness(false);
      }, 700);
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gType === 'volume') {
      volumeTimerRef.current = window.setTimeout(() => {
        setIsAdjustingVolume(false);
      }, 700);
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gType === 'swipe') {
      const currentDy = dragDeltaY;
      setDragDeltaY(0);
      setIsDraggingEpisode(false);

      if (currentDy < -56) {
        if (episode.number >= drama.episodes.length && dramas.length <= 1) {
          onNotify('已经是最后一集了');
        } else {
          handleNextEpisodeOrDrama();
        }
      } else if (currentDy > 56) {
        if (episode.number <= 1) {
          onNotify('已经是第一集了');
        } else {
          handlePrevEpisodeOrDrama();
        }
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    // Pure single tap on video area -> wait 230ms so double-tap can cancel, then toggle play/pause cleanly
    if (start && Date.now() - start.time < 320) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        if (isCleanMode) {
          setIsCleanMode(false);
          pokeHud();
        } else if ((effectiveLandscape || isFullscreen) && !hudVisible) {
          pokeHud();
        } else {
          togglePlayPause();
        }
      }, 230);
    }

    gestureTypeRef.current = 'none';
    touchStartRef.current = null;
  };

  const handleStageMouseClick = () => {
    // Ignore synthesized mouse click right after touch interaction
    if (Date.now() - lastTouchHandledAtRef.current < 500) return;

    if (isCleanMode) {
      setIsCleanMode(false);
      pokeHud();
      return;
    }
    if ((effectiveLandscape || isFullscreen) && !hudVisible) {
      pokeHud();
      return;
    }
    togglePlayPause();
  };

  const handleShare = async () => {
    const shareText = `正在黄果短剧观看《${drama.title}》第 ${episode.number} 集`;
    try {
      await navigator.clipboard.writeText(
        `${shareText} · ${window.location.href}`
      );
      onNotify('剧集链接已复制');
    } catch {
      onNotify(shareText);
    }
  };

  // Poster decryption fallback
  const preferredPoster = useMemo(() => {
    return effectiveLandscape && drama.heroUrl
      ? drama.heroUrl
      : (episode.posterUrl ?? drama.posterUrl);
  }, [drama.heroUrl, drama.posterUrl, effectiveLandscape, episode.posterUrl]);

  const [decryptedPosterUrl, setDecryptedPosterUrl] = useState<string>(
    () => getCachedDecryptedUrl(preferredPoster) || ''
  );
  const [posterStage, setPosterStage] = useState<
    'decrypting' | 'ready' | 'fallback' | 'placeholder'
  >(() => {
    if (!preferredPoster) return 'placeholder';
    if (getCachedDecryptedUrl(preferredPoster)) return 'ready';
    return 'decrypting';
  });

  useEffect(() => {
    let active = true;
    if (!preferredPoster) {
      setPosterStage('placeholder');
      setDecryptedPosterUrl('');
      return;
    }
    const cached = getCachedDecryptedUrl(preferredPoster);
    if (cached) {
      setDecryptedPosterUrl(cached);
      setPosterStage('ready');
      return;
    }
    setPosterStage('decrypting');
    decryptCoverImage(preferredPoster)
      .then((objUrl) => {
        if (!active) return;
        if (objUrl) {
          setDecryptedPosterUrl(objUrl);
          setPosterStage('ready');
        } else {
          setPosterStage('fallback');
        }
      })
      .catch(() => {
        if (active) setPosterStage('fallback');
      });
    return () => {
      active = false;
    };
  }, [preferredPoster]);

  const resolvedPosterUrl = useMemo(() => {
    return posterStage === 'ready' ? decryptedPosterUrl : '';
  }, [posterStage, decryptedPosterUrl]);

  const storyboardFrames = useMemo(() => {
    const base = episode.storyboardImages?.length
      ? episode.storyboardImages
      : [episode.posterUrl ?? drama.posterUrl];
    if (effectiveLandscape && drama.heroUrl && !base.includes(drama.heroUrl)) {
      return [drama.heroUrl, ...base];
    }
    return base;
  }, [
    drama.heroUrl,
    drama.posterUrl,
    effectiveLandscape,
    episode.posterUrl,
    episode.storyboardImages,
  ]);

  const sceneIndex =
    Math.floor((currentTime / Math.max(duration, 1)) * storyboardFrames.length) %
    storyboardFrames.length;

  const [failedFrames, setFailedFrames] = useState<Set<string>>(() => new Set());
  const rawActiveFrameUrl = storyboardFrames[sceneIndex] ?? drama.posterUrl;
  const activeFrameUrl = useMemo(() => {
    if (!failedFrames.has(rawActiveFrameUrl)) {
      return rawActiveFrameUrl;
    }
    const clean = cleanCoverUrl(rawActiveFrameUrl);
    if (!failedFrames.has(clean) && clean !== rawActiveFrameUrl) {
      return clean;
    }
    return '';
  }, [rawActiveFrameUrl, failedFrames]);

  const syncVideoAspectRatio = useCallback((video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setMediaAspectRatio(video.videoWidth / video.videoHeight);
    }
  }, []);

  // Full 100dvh on portrait mobile (no bottom nav fighting for space!); spacious cinema stage on desktop
  const stageBg = useNativeMedia3 ? 'bg-transparent' : 'bg-black';
  const stageContainerClass = isRotatedMobileLandscape
    ? `fixed top-1/2 left-1/2 z-50 w-[100dvh] h-[100vw] -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center rounded-none border-0 ${stageBg}`
    : isFullscreen || isImmersiveLandscape
      ? `fixed inset-0 z-50 w-screen h-[100dvh] rounded-none border-0 ${stageBg}`
      : isLandscape
        ? `relative w-full aspect-video max-h-[78dvh] rounded-2xl lg:rounded-3xl ${stageBg} border border-white/[0.1]`
        : `relative w-full h-[100dvh] md:h-[calc(100dvh-96px)] lg:h-[calc(100dvh-116px)] lg:max-h-[820px] lg:w-[430px] xl:w-[460px] lg:rounded-3xl ${stageBg} border-0 lg:border lg:border-white/[0.1] shrink-0`;

  const showSideEpisodeDrawer = isFullscreen || effectiveLandscape;
  const isControlsVisible = !isCleanMode && hudVisible;
  const isCompactPortrait = !effectiveLandscape && !isFullscreen;
  const shouldLiftLandscapeMedia =
    isCompactPortrait && isLandscapeMedia && effectiveFit === 'contain';

  // Anchor the prominent "全屏观看" CTA directly beneath the fitted horizontal video frame
  const landscapePromptTop = useMemo(() => {
    const stageW = stageSize.w || 390;
    const stageH = stageSize.h || 780;
    const safeMaxTop = Math.max(stageH * 0.52, stageH - 210);
    if (!shouldLiftLandscapeMedia || !mediaAspectRatio) {
      return Math.min(safeMaxTop, stageH * 0.62);
    }
    const wrapperH = stageH * 0.88;
    const opticalCenterY = stageH * 0.44;
    const renderedVideoH = Math.min(wrapperH, stageW / Math.max(mediaAspectRatio, 1.05));
    const idealTop = opticalCenterY + renderedVideoH / 2 + 16;
    return Math.round(Math.min(safeMaxTop, Math.max(stageH * 0.5, idealTop)));
  }, [mediaAspectRatio, shouldLiftLandscapeMedia, stageSize.h, stageSize.w]);

  return (
    <div
      className={
        isLandscape && !isImmersiveOverlay
          ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 space-y-6'
          : 'lg:max-w-7xl lg:mx-auto lg:px-8 lg:py-6'
      }
    >
      <div
        className={
          isLandscape && !isImmersiveOverlay
            ? 'flex flex-col gap-6'
            : 'flex flex-col lg:flex-row lg:items-stretch lg:justify-center gap-6'
        }
      >
        {/* Main Immersive Theater Stage */}
        <div
          id="theater-stage"
          data-testid="theater-stage"
          ref={stageRef}
          onMouseMove={pokeHud}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={`${stageContainerClass} touch-stage overflow-hidden`}
        >
          {/* Vertical Drag & Peeking Canvas */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden"
            style={{
              transform:
                dragDeltaY !== 0 ? `translate3d(0, ${dragDeltaY}px, 0)` : undefined,
              transition: isDraggingEpisode
                ? 'none'
                : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {effectiveFit === 'contain' && activeFrameUrl && (
              <img
                src={activeFrameUrl}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-20 pointer-events-none"
              />
            )}

            {/* Media Framing Box (optically lifted in portrait for horizontal videos so bottom HUD never collides) */}
            <div
              className={`absolute inset-x-0 top-0 transition-[bottom] duration-200 ${
                shouldLiftLandscapeMedia ? 'bottom-[12%]' : 'bottom-0'
              }`}
            >
              {/* Poster-to-First-Frame Layer */}
              {posterStage !== 'placeholder' && resolvedPosterUrl ? (
                <img
                  src={resolvedPosterUrl}
                  alt={drama.title}
                  referrerPolicy="no-referrer"
                  onError={() => setPosterStage('placeholder')}
                  className={`absolute inset-0 h-full w-full ${mediaFitClass} transition-opacity duration-200 ${
                    hasExternalStream && videoReady ? 'opacity-0' : 'opacity-100'
                  }`}
                />
              ) : (
                <div
                  data-testid="cover-placeholder"
                  className={`cover-placeholder absolute inset-0 h-full w-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#1D202A] via-[#14161D] to-[#0B0C10] ${
                    hasExternalStream && videoReady ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 mb-2">
                    <Play className="w-6 h-6 fill-current ml-0.5" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold text-slate-100 line-clamp-1">
                    {drama.title}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">
                    第 {episode.number} 集
                  </span>
                </div>
              )}

              {/* Mode A: Real HLS / MP4 Video */}
              {hasExternalStream ? (
                <video
                  ref={videoRef}
                  playsInline
                  preload="auto"
                  poster={resolvedPosterUrl || undefined}
                  onLoadedMetadata={(e) => {
                    if (useNativeMedia3) return;
                    const dur = e.currentTarget.duration;
                    if (Number.isFinite(dur) && dur > 0) setDuration(dur);
                    syncVideoAspectRatio(e.currentTarget);
                  }}
                  onResize={(e) => {
                    if (useNativeMedia3) return;
                    syncVideoAspectRatio(e.currentTarget);
                  }}
                  onPlaying={(e) => {
                    if (useNativeMedia3) return;
                    syncVideoAspectRatio(e.currentTarget);
                    setVideoReady(true);
                    setIsBuffering(false);
                    setStreamError(null);
                  }}
                  onWaiting={() => {
                    if (!useNativeMedia3) setIsBuffering(true);
                  }}
                  onStalled={() => {
                    if (!useNativeMedia3) setIsBuffering(true);
                  }}
                  onTimeUpdate={(e) => {
                    if (useNativeMedia3) return;
                    const v = e.currentTarget;
                    setCurrentTime(v.currentTime);
                    if (v.buffered.length > 0 && v.duration > 0) {
                      setBufferedRatio(
                        v.buffered.end(v.buffered.length - 1) / v.duration
                      );
                    }
                    onRecordProgress(
                      drama.id,
                      episode.number,
                      v.currentTime,
                      v.duration || duration,
                      false
                    );
                  }}
                  onEnded={() => {
                    if (useNativeMedia3) return;
                    onRecordProgress(drama.id, episode.number, duration, duration, true);
                    if (autoAdvance) {
                      handleNextEpisodeOrDrama();
                    } else {
                      setIsPlaying(false);
                    }
                  }}
                  onError={() => {
                    if (useNativeMedia3) return;
                    setIsBuffering(false);
                    setStreamError('片源流暂时无法播放，建议切换其他极速线路或使用剧照预览。');
                  }}
                  className={
                    useNativeMedia3
                      ? 'opacity-0 pointer-events-none w-full h-full'
                      : `absolute inset-0 h-full w-full ${mediaFitClass} transition-opacity duration-200 ${
                          videoReady ? 'opacity-100' : 'opacity-0'
                        }`
                  }
                />
              ) : (
                /* Mode B: Storyboard Preview Engine */
                <div className="absolute inset-0 overflow-hidden">
                  {activeFrameUrl && (
                    <img
                      key={`${drama.id}-${episode.number}-${sceneIndex}-${effectiveFit}`}
                      src={activeFrameUrl}
                      alt={`${drama.title} 第 ${episode.number} 集`}
                      referrerPolicy="no-referrer"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                          setMediaAspectRatio(img.naturalWidth / img.naturalHeight);
                        }
                      }}
                      onError={() =>
                        setFailedFrames((prev) => new Set(prev).add(rawActiveFrameUrl))
                      }
                      className={`h-full w-full ${mediaFitClass} ${
                        sceneIndex % 2 === 0 ? 'animate-cinema-in' : 'animate-cinema-out'
                      } ${!isPlaying ? 'cinema-paused' : ''}`}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Screen Brightness Overlay */}
          <div
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-75 z-20"
            style={{ opacity: Math.max(0, 1 - brightness) }}
            aria-hidden="true"
          />

          {/* Floating Hearts & Gesture HUDs */}
          <FloatingHearts hearts={hearts} />
          <SpeedBoostHUD visible={isSpeedBoosting} rate={2.0} />
          <VerticalSliderHUD
            visible={isAdjustingBrightness}
            type="brightness"
            value={brightness}
          />
          <VerticalSliderHUD
            visible={isAdjustingVolume}
            type="volume"
            value={volume}
            isMuted={isMuted}
          />
          <SeekHUD
            visible={Boolean(seekHUD?.visible)}
            targetTime={seekHUD?.targetTime ?? 0}
            duration={duration}
            deltaSeconds={seekHUD?.deltaSeconds ?? 0}
          />
          <SwipePeekIndicator
            dragDeltaY={dragDeltaY}
            currentEpisode={episode.number}
            totalEpisodes={drama.episodes.length}
            nextEpisodeTitle={nextEpisode?.title}
            prevEpisodeTitle={
              drama.episodes.find((ep) => ep.number === episode.number - 1)?.title
            }
            hasNextDrama={dramas.length > 1}
          />

          {/* Clean Mode Floating Exit */}
          {isCleanMode && (
            <div
              data-no-gesture="true"
              className={`absolute z-40 ${
                isRotatedMobileLandscape
                  ? 'bottom-4 right-[calc(env(safe-area-inset-bottom,0px)+16px)]'
                  : 'bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] right-[calc(env(safe-area-inset-right,0px)+16px)]'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setIsCleanMode(false);
                  pokeHud();
                }}
                aria-label="退出清屏"
                className="min-h-[40px] px-4 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-xs text-white font-medium inline-flex items-center gap-1.5 shadow-2xl active:scale-95 transition-transform"
              >
                <Eye className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>退出清屏</span>
              </button>
            </div>
          )}

          {/* Cinematic Contrast Scrims */}
          <div
            className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none transition-opacity duration-200 ${
              isControlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none transition-opacity duration-200 ${
              isControlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Stage Tap Surface (Mouse Click + Center Play Indicator when paused) */}
          <div
            role="button"
            tabIndex={0}
            aria-label={isPlaying ? '暂停播放' : '继续播放'}
            onClick={handleStageMouseClick}
            onDoubleClick={() => {
              if (Date.now() - lastTouchHandledAtRef.current < 600) return;
              void toggleFullscreen();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                togglePlayPause();
              }
            }}
            className={`absolute inset-0 z-10 w-full h-full flex items-center justify-center focus:outline-none cursor-pointer ${
              shouldLiftLandscapeMedia ? 'pb-[12%]' : ''
            }`}
          >
            {!isPlaying && !streamError && !isCleanMode && (
              <span className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl pointer-events-none">
                <Play className="w-7 h-7 fill-current ml-1" aria-hidden="true" />
              </span>
            )}
          </div>

          {/* Prominent One-Tap Fullscreen CTA anchored beneath horizontal videos in portrait */}
          {isCompactPortrait && isLandscapeMedia && !streamError && !isCleanMode && (
            <div
              data-no-gesture="true"
              style={{ top: `${landscapePromptTop}px` }}
              className={`absolute left-1/2 -translate-x-1/2 z-20 transition-opacity duration-200 ${
                isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                type="button"
                onClick={() => void toggleLandscape()}
                aria-label="横屏全屏观看"
                className="min-h-[40px] px-4 rounded-full bg-white/[0.12] hover:bg-white/[0.2] active:scale-95 backdrop-blur-md border border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-lg transition-all whitespace-nowrap"
              >
                <Maximize className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>全屏观看</span>
              </button>
            </div>
          )}

          {/* Buffering Indicator */}
          {isBuffering && !streamError && (
            <div
              className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none ${
                shouldLiftLandscapeMedia ? 'pb-[12%]' : ''
              }`}
            >
              <div className="px-4 py-2.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 flex items-center gap-2 text-xs text-slate-100">
                <Loader2
                  className="w-4 h-4 animate-spin text-amber-400"
                  aria-hidden="true"
                />
                <span>缓冲中...</span>
              </div>
            </div>
          )}

          {/* Stream Error Recovery Overlay */}
          {streamError && (
            <div
              data-no-gesture="true"
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            >
              <div className="max-w-xs w-full rounded-2xl bg-[#14161D] border border-white/10 p-5 text-center space-y-4 shadow-2xl">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 mx-auto flex items-center justify-center">
                  <Film className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">视频加载受阻</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {streamError}
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStreamError(null);
                      setRetryToken((n) => n + 1);
                    }}
                    className="min-h-[44px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>重试播放</span>
                  </button>
                  {onOpenLineSelector && (
                    <button
                      type="button"
                      onClick={onOpenLineSelector}
                      className="min-h-[42px] w-full rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-amber-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>切换极速线路</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStreamError(null);
                      setUseFallbackPlayback(true);
                      onNotify('已切换至剧照预览模式');
                    }}
                    className="min-h-[40px] w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-medium inline-flex items-center justify-center transition-colors"
                  >
                    <span>使用剧照预览播放</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Top Bar inside Stage (Safe-area aware in both portrait & 90deg rotated landscape) */}
          <div
            data-no-gesture="true"
            className={`absolute top-0 inset-x-0 z-20 transition-opacity duration-200 ${
              isRotatedMobileLandscape
                ? 'pt-2 pl-[calc(env(safe-area-inset-top,0px)+14px)] pr-[calc(env(safe-area-inset-bottom,0px)+14px)]'
                : 'pt-safe pl-[calc(env(safe-area-inset-left,0px)+12px)] pr-[calc(env(safe-area-inset-right,0px)+12px)] sm:px-4'
            } ${
              isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="h-14 flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isLandscape) {
                      void toggleLandscape();
                    } else if (isFullscreen) {
                      void toggleFullscreen();
                    } else {
                      onExitTheater?.();
                    }
                  }}
                  aria-label="返回"
                  className="min-h-[44px] min-w-[44px] -ml-1 rounded-full hover:bg-black/40 text-white flex items-center justify-center transition-colors shrink-0 active:scale-95"
                >
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {drama.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono tabular-nums">
                    <span>第 {episode.number} 集</span>
                    {useFallbackPlayback && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setUseFallbackPlayback(false);
                            setRetryToken((n) => n + 1);
                          }}
                          className="text-amber-300 underline underline-offset-2"
                        >
                          预览模式(重试)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Desktop / Landscape quick prev-next buttons */}
                <button
                  type="button"
                  onClick={handlePrevEpisodeOrDrama}
                  aria-label="上一集"
                  className="hidden md:flex min-h-[40px] min-w-[40px] rounded-full bg-black/40 hover:bg-black/65 text-white items-center justify-center transition-colors"
                >
                  <ChevronUp className="w-5 h-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleNextEpisodeOrDrama}
                  aria-label="下一集"
                  className="hidden md:flex min-h-[40px] min-w-[40px] rounded-full bg-black/40 hover:bg-black/65 text-white items-center justify-center transition-colors"
                >
                  <ChevronDown className="w-5 h-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCleanMode(true);
                    onNotify('已清屏，点右下角退出');
                  }}
                  aria-label="清屏模式"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-black/35 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
                >
                  <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={openMoreSheet}
                  aria-label="更多播放设置"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-black/35 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
                >
                  <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Right-Edge Ergonomic Thumb Rail (Portrait Only: 4 clean actions) */}
          {isCompactPortrait && (
            <div
              data-no-gesture="true"
              className={`absolute right-2.5 bottom-[calc(env(safe-area-inset-bottom,0px)+144px)] z-20 flex flex-col items-center gap-3 transition-opacity duration-200 ${
                isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleLike(drama.id, episode.number)}
                aria-label={isLiked ? '取消点赞' : '点赞本集'}
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
              >
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                    isLiked
                      ? 'bg-amber-500/25 text-amber-400'
                      : 'bg-black/40 text-white'
                  }`}
                >
                  <Heart
                    className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-[11px] font-mono tabular-nums text-white drop-shadow">
                  {formatLikes(likeCount)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleFollow(drama.id)}
                aria-label={isFollowed ? '取消追剧' : '加入追剧'}
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
              >
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                    isFollowed
                      ? 'bg-amber-500/25 text-amber-400'
                      : 'bg-black/40 text-white'
                  }`}
                >
                  {isFollowed ? (
                    <BookmarkCheck className="w-6 h-6" aria-hidden="true" />
                  ) : (
                    <Bookmark className="w-6 h-6" aria-hidden="true" />
                  )}
                </span>
                <span className="text-[11px] text-white drop-shadow">
                  {isFollowed ? '已追' : '追剧'}
                </span>
              </button>

              <button
                type="button"
                onClick={openEpisodeSheet}
                aria-label="打开选集"
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
              >
                <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                  <ListVideo className="w-6 h-6" aria-hidden="true" />
                </span>
                <span className="text-[11px] text-white drop-shadow">选集</span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                aria-label="分享剧集"
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
              >
                <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                  <Share2 className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-[11px] text-white drop-shadow">分享</span>
              </button>
            </div>
          )}

          {/* Bottom Info + Scrubber + Iconic HongGuo Episode Bar (Portrait) OR Wide Controls (Landscape/Fullscreen) */}
          <div
            data-no-gesture="true"
            className={`absolute bottom-0 inset-x-0 z-20 pt-2 space-y-1.5 ${
              isRotatedMobileLandscape
                ? 'pl-[calc(env(safe-area-inset-top,0px)+14px)] pr-[calc(env(safe-area-inset-bottom,0px)+14px)] pb-3'
                : 'pl-[calc(env(safe-area-inset-left,0px)+14px)] pr-[calc(env(safe-area-inset-right,0px)+14px)] sm:px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]'
            }`}
          >
            {isControlsVisible && isCompactPortrait && (
              <div className="pr-16 space-y-1 pointer-events-none">
                <p className="text-xs sm:text-sm text-white/95 line-clamp-2 leading-snug drop-shadow">
                  {episode.hook || drama.tagline}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300/90 pointer-events-auto drop-shadow pt-0.5">
                  <span className="text-amber-300 font-medium">{drama.category}</span>
                  {drama.genres.slice(0, 3).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTag?.(tag);
                        onExitTheater?.();
                      }}
                      title={`查看 ${tag} 短剧`}
                      className="hg-tag px-1.5 py-0.2 rounded-[3px] text-[10px] font-normal leading-[13px] bg-[#ffd21c]/15 text-[#ffd21c] border border-[#ffd21c]/30 hover:bg-[#ffd21c]/25 hover:border-[#ffd21c]/60 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                  {nextEpisode && preloadTriggered && (
                    <span className="text-emerald-400 text-[10px] ml-1">· 下集已就绪</span>
                  )}
                </div>
              </div>
            )}

            <PlayerProgressOverlay
              currentTime={currentTime}
              duration={duration}
              bufferedRatio={bufferedRatio}
              subtitlesEnabled={subtitlesEnabled}
              subtitles={episode.subtitles}
              isPlaying={isPlaying}
              onSeek={handleSeek}
              showControls={isControlsVisible}
              compactPortrait={isCompactPortrait}
              isRotated90={isRotatedMobileLandscape}
            />

            {/* Portrait HongGuo Bottom Strip: Full-Width Episode Trigger + Quick Speed Toggle */}
            {isCompactPortrait ? (
              <div
                className={`flex items-center gap-2 transition-opacity duration-200 ${
                  isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={openEpisodeSheet}
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.18] backdrop-blur-md text-left flex items-center justify-between gap-2 text-white active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ListVideo
                      className="w-4 h-4 text-amber-400 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-xs sm:text-sm font-medium truncate tabular-nums">
                      选集 · 第 {episode.number} 集 / 共 {drama.episodes.length} 集
                    </span>
                  </div>
                  <ChevronRight
                    className="w-4 h-4 text-slate-300 shrink-0"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={cyclePlaybackRate}
                  aria-label="快捷切换倍速"
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.18] backdrop-blur-md text-xs font-mono tabular-nums font-semibold text-amber-300 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  {playbackRate}x
                </button>
              </div>
            ) : (
              /* Landscape / Fullscreen Wide Control Strip */
              <div
                className={`flex items-center justify-between gap-2 pt-0.5 transition-opacity duration-200 ${
                  isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? '暂停' : '播放'}
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center shrink-0"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    aria-label={isMuted ? '取消静音' : '静音'}
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center shrink-0"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-slate-300" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleFollow(drama.id)}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isFollowed
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    {isFollowed ? (
                      <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{isFollowed ? '已追剧' : '追剧'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openEpisodeSheet}
                    className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <ListVideo className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>选集</span>
                  </button>

                  <button
                    type="button"
                    onClick={cyclePlaybackRate}
                    className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono tabular-nums text-white whitespace-nowrap shrink-0"
                  >
                    {playbackRate}x
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleLandscape()}
                    className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>竖屏</span>
                  </button>

                  {!isRotatedMobileLandscape && (
                    <button
                      type="button"
                      onClick={() => void toggleFullscreen()}
                      aria-label={isFullscreen ? '退出全屏' : '全屏'}
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center shrink-0"
                    >
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Maximize className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Episode Bottom Sheet / Side Drawer */}
          {showEpisodeSheet && (
            <div
              data-no-gesture="true"
              className={`absolute inset-0 z-40 flex bg-black/65 backdrop-blur-sm ${
                showSideEpisodeDrawer
                  ? 'justify-end items-stretch'
                  : 'items-end justify-center'
              }`}
              onClick={() => setShowEpisodeSheet(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="选集列表"
                onClick={(e) => e.stopPropagation()}
                className={
                  showSideEpisodeDrawer
                    ? `w-80 sm:w-96 max-w-[85%] h-full bg-[#14161D]/95 backdrop-blur-md border-l border-white/15 p-5 flex flex-col ${
                        isRotatedMobileLandscape
                          ? 'pr-[calc(env(safe-area-inset-bottom,0px)+18px)]'
                          : ''
                      }`
                    : 'animate-sheet-up w-full max-w-xl max-h-[72dvh] rounded-t-3xl bg-[#14161D] border-t border-white/15 px-4 sm:px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] flex flex-col shadow-2xl'
                }
              >
                {!showSideEpisodeDrawer && (
                  <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2.5 shrink-0" />
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <EpisodeSelectorGrid
                    drama={drama}
                    currentEpisodeNumber={episode.number}
                    watchedMaxEpisode={episode.number}
                    onSelectEpisode={(epNum) =>
                      onSelectDramaEpisode(drama.id, epNum, 0)
                    }
                    onClose={() => setShowEpisodeSheet(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Single-Handed "More Settings" Bottom Sheet (Houses Quality, Speed, Subtitles, Landscape, Fit, Line) */}
          {showMoreSheet && (
            <div
              data-no-gesture="true"
              className="absolute inset-0 z-40 flex items-end justify-center bg-black/65 backdrop-blur-sm"
              onClick={() => setShowMoreSheet(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="更多播放设置"
                onClick={(e) => e.stopPropagation()}
                className={`animate-sheet-up w-full max-w-xl rounded-t-3xl bg-[#14161D] border-t border-white/15 px-5 pt-2.5 space-y-5 shadow-2xl max-h-[88%] overflow-y-auto no-scrollbar ${
                  isRotatedMobileLandscape
                    ? 'pb-5'
                    : 'pb-[calc(env(safe-area-inset-bottom,0px)+20px)]'
                }`}
              >
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />

                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">播放设置</h3>
                  <button
                    type="button"
                    onClick={() => setShowMoreSheet(false)}
                    aria-label="关闭设置"
                    className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>

                {/* Playback Speed */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>播放倍速</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          setPlaybackRate(rate);
                          onNotify(`已切换为 ${rate}x 倍速`);
                        }}
                        className={`min-h-[42px] rounded-xl text-xs font-mono tabular-nums font-semibold transition-colors ${
                          playbackRate === rate
                            ? 'bg-amber-500 text-[#0B0C10]'
                            : 'bg-[#1D202A] text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Quality */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Layers className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>画质清晰度</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {QUALITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChangeQuality(opt.value);
                          onNotify(`清晰度已设为 ${opt.label}`);
                        }}
                        className={`min-h-[42px] rounded-xl text-xs font-medium transition-colors ${
                          preferredQuality === opt.value
                            ? 'bg-amber-500 text-[#0B0C10] font-bold'
                            : 'bg-[#1D202A] text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Toggles Grid */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoAdvance;
                      setAutoAdvance(next);
                      onNotify(next ? '自动连播已开启' : '自动连播已关闭');
                    }}
                    className={`min-h-[58px] px-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs transition-colors border ${
                      autoAdvance
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                        : 'bg-[#1D202A] border-transparent text-slate-300'
                    }`}
                  >
                    <Play className="w-4 h-4" aria-hidden="true" />
                    <span>{autoAdvance ? '连播：开' : '连播：关'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = !subtitlesEnabled;
                      setSubtitlesEnabled(next);
                      onNotify(next ? '字幕已开启' : '字幕已关闭');
                    }}
                    className={`min-h-[58px] px-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs transition-colors border ${
                      subtitlesEnabled
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                        : 'bg-[#1D202A] border-transparent text-slate-300'
                    }`}
                  >
                    <Captions className="w-4 h-4" aria-hidden="true" />
                    <span>{subtitlesEnabled ? '字幕：开' : '字幕：关'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    className={`min-h-[58px] px-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs transition-colors border ${
                      isMuted
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                        : 'bg-[#1D202A] border-transparent text-slate-300'
                    }`}
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>{isMuted ? '已静音' : '声音开启'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleLandscape()}
                    className={`min-h-[58px] px-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs transition-colors border ${
                      effectiveLandscape
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                        : 'bg-[#1D202A] border-transparent text-slate-300'
                    }`}
                  >
                    <RotateCw className="w-4 h-4" aria-hidden="true" />
                    <span>{effectiveLandscape ? '恢复竖屏' : '横屏影院'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextFit: FitMode =
                        fitMode === 'auto'
                          ? 'contain'
                          : fitMode === 'contain'
                            ? 'cover'
                            : 'auto';
                      setFitMode(nextFit);
                      onNotify(
                        nextFit === 'auto'
                          ? '画面：智能适配（横屏完整 / 竖屏铺满）'
                          : nextFit === 'contain'
                            ? '画面：完整显示'
                            : '画面：铺满屏幕'
                      );
                    }}
                    className={`min-h-[58px] px-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs transition-colors border ${
                      fitMode !== 'auto'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                        : 'bg-[#1D202A] border-transparent text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Ratio className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    <span>
                      {fitMode === 'auto'
                        ? '画面：智能'
                        : fitMode === 'contain'
                          ? '画面：完整'
                          : '画面：铺满'}
                    </span>
                  </button>

                  {onOpenLineSelector && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreSheet(false);
                        onOpenLineSelector();
                      }}
                      className="min-h-[58px] px-2 rounded-2xl bg-[#1D202A] text-slate-200 flex flex-col items-center justify-center gap-1 text-xs transition-colors hover:bg-white/10"
                    >
                      <Wifi className="w-4 h-4 text-amber-400" aria-hidden="true" />
                      <span className="truncate max-w-full">
                        {currentLineLabel ? `换线(${currentLineLabel})` : '切换线路'}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 text-center">
                  手势提示：全屏上下滑切集 · 单击暂停 · 双击点赞 · 长按 2x 倍速
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Side Panel (Vertical Mode) OR Wide Strip Below Stage (Desktop Landscape) */}
        {!isImmersiveOverlay && (
          <aside
            className={
              isLandscape
                ? 'hidden md:grid rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 grid-cols-1 lg:grid-cols-12 gap-6 items-start'
                : 'hidden lg:flex flex-col w-[380px] xl:w-[420px] h-[calc(100dvh-116px)] max-h-[820px] rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 overflow-hidden'
            }
          >
            <div
              className={
                isLandscape
                  ? 'lg:col-span-5 space-y-3'
                  : 'space-y-3 pb-5 border-b border-white/[0.08]'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">
                    {drama.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {drama.category}
                    </span>
                    {drama.genres.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          onSelectTag?.(tag);
                          onExitTheater?.();
                        }}
                        className="hg-tag px-2 py-0.5 rounded-[3px] text-[10px] font-normal leading-[15px] bg-[#ffd21c]/10 text-[#ffd21c] border border-[#ffd21c]/25 hover:bg-[#ffd21c]/20 hover:border-[#ffd21c]/50 transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                    {drama.releaseYear && (
                      <span className="text-[11px] text-slate-500 font-mono ml-0.5">
                        · {drama.releaseYear}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleFollow(drama.id)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    isFollowed
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-amber-500 hover:bg-amber-400 text-[#0B0C10]'
                  }`}
                >
                  {isFollowed ? (
                    <>
                      <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
                      <span>已追剧</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" aria-hidden="true" />
                      <span>追剧</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                {drama.synopsis}
              </p>

              <p className="text-xs text-slate-500 pt-1">
                快捷键：空格暂停 · F 全屏 · L 横竖屏 · ↑↓ 切集 · ←→ 快进
              </p>
            </div>

            <div
              className={
                isLandscape
                  ? 'lg:col-span-7 max-h-[320px] flex flex-col'
                  : 'flex-1 min-h-0 pt-4'
              }
            >
              <EpisodeSelectorGrid
                drama={drama}
                currentEpisodeNumber={episode.number}
                watchedMaxEpisode={episode.number}
                onSelectEpisode={(epNum) =>
                  onSelectDramaEpisode(drama.id, epNum, 0)
                }
              />
            </div>

            {!isLandscape && (
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
                <span>支持上下滑切集 · 右上角更多设置</span>
                <span className="font-mono text-amber-400 tabular-nums">
                  {episode.number}/{drama.episodes.length}
                </span>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
