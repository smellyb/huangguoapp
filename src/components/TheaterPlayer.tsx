import Hls from 'hls.js';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Captions,
  ChevronDown,
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
  Pause,
  Play,
  Ratio,
  RefreshCw,
  RotateCw,
  Share2,
  Smartphone,
  Volume2,
  VolumeX,
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

type FitMode = 'cover' | 'contain';

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
  onSeek: (seconds: number) => void;
  showControls: boolean;
}

/**
 * Isolated high-frequency progress & subtitle layer so playback ticks never
 * force re-renders on the episode grid or outer theater shell.
 */
const PlayerProgressOverlay = memo(function PlayerProgressOverlay({
  currentTime,
  duration,
  bufferedRatio,
  subtitlesEnabled,
  subtitles,
  onSeek,
  showControls,
}: ProgressOverlayProps) {
  const activeSubtitle = useMemo(() => {
    if (!subtitlesEnabled || subtitles.length === 0) return '';
    const cue = subtitles.find(
      (item) => currentTime >= item.start && currentTime <= item.end
    );
    return cue?.text ?? '';
  }, [subtitlesEnabled, subtitles, currentTime]);

  const progressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = Math.min(
    100,
    Math.max(progressPercent, bufferedRatio * 100)
  );

  return (
    <div className="space-y-3">
      {activeSubtitle && (
        <div className="px-3 text-center pointer-events-none">
          <p className="inline-block max-w-[92%] px-3.5 py-1.5 rounded-xl bg-black/70 backdrop-blur-sm text-sm sm:text-[15px] font-medium text-white leading-snug shadow-sm">
            {activeSubtitle}
          </p>
        </div>
      )}

      <div
        className={`space-y-1.5 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="relative h-5 flex items-center group">
          <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white/35 transition-[width] duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
          <div
            className="absolute left-0 h-1.5 rounded-full bg-amber-500 pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.5}
            value={Math.min(currentTime, duration)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="播放进度"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300/90">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
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
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
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
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
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
                className={`min-h-[36px] px-3.5 py-1 rounded-xl text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-amber-500 text-[#0B0C10] border-amber-400 font-bold shadow-md shadow-amber-500/20'
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
              className={`min-h-[46px] rounded-xl font-mono text-sm tabular-nums transition-all flex flex-col items-center justify-center relative border ${
                isCurrent
                  ? 'bg-amber-500 text-[#0B0C10] border-amber-300 font-bold shadow-lg shadow-amber-500/25 scale-[1.02]'
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
  onChangeQuality: (quality: QualityPreference) => void;
  onSelectDramaEpisode: (
    dramaId: string,
    episodeNumber: number,
    resumeAt?: number
  ) => void;
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
  onChangeQuality,
  onSelectDramaEpisode,
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

  // Reset fallback preference when user switches drama or episode
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
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [preloadTriggered, setPreloadTriggered] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // Automatically resolve remote HLS stream URL if not yet loaded
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
            setStreamError('当前线路未能获取到有效视频流，建议切换极速直连线路或使用剧照预览播放。');
          }
        })
        .catch((err) => {
          if (!active) return;
          setResolvedHlsUrl(undefined);
          setResolvedCdn(undefined);
          const msg = err instanceof Error ? err.message : '网络请求失败';
          setStreamError(`视频流解析受阻 (${msg})，建议切换直连线路或使用剧照预览播放。`);
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

  // Fullscreen & Landscape Cinema Modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [isDeviceLandscape, setIsDeviceLandscape] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>('cover');
  const [hudVisible, setHudVisible] = useState(true);

  // Gestures & Floating Overlays (HongGuo specification)
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

  // Clean Screen Mode & Auto-Advance
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const stallAttemptsRef = useRef(0);
  const currentTimeRef = useRef(initialTimeSeconds);
  const hudTimerRef = useRef<number | null>(null);

  // Gesture tracking refs
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    stageW: number;
    stageH: number;
    startBrightness: number;
    startVolume: number;
    startSeekTime: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapPosRef = useRef({ x: 0, y: 0 });
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

  // Detect viewport orientation for automatic mobile landscape adaptation
  useEffect(() => {
    const updateViewportState = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortraitMobile(w < 768 && h > w);
      setIsDeviceLandscape(w > h && h <= 560);
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);
    window.addEventListener('orientationchange', updateViewportState);
    return () => {
      window.removeEventListener('resize', updateViewportState);
      window.removeEventListener('orientationchange', updateViewportState);
    };
  }, []);

  // Sync native browser Fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsNativeFullscreen(active);
      if (!active) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Lock body scroll while in immersive fullscreen or rotated mobile landscape
  const effectiveLandscape = isLandscape || isDeviceLandscape;
  const isRotatedMobileLandscape = isLandscape && isPortraitMobile && !isNativeFullscreen;
  const isImmersiveOverlay = isFullscreen || isRotatedMobileLandscape || isDeviceLandscape;

  useEffect(() => {
    if (!isImmersiveOverlay) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isImmersiveOverlay]);

  // Auto-hide HUD after 3s of inactivity during playback for immersive viewing
  const pokeHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }

    if (
      isPlaying &&
      !showEpisodeSheet &&
      !showQualityMenu &&
      !showSpeedMenu &&
      !isSpeedBoosting
    ) {
      hudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 3000);
    }
  }, [
    isPlaying,
    showEpisodeSheet,
    showQualityMenu,
    showSpeedMenu,
    isSpeedBoosting,
  ]);

  useEffect(() => {
    if (!isPlaying || showEpisodeSheet || showQualityMenu || showSpeedMenu) {
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
    isPlaying,
    pokeHud,
    showEpisodeSheet,
    showQualityMenu,
    showSpeedMenu,
  ]);

  const toggleFullscreen = useCallback(async () => {
    setShowQualityMenu(false);
    setShowSpeedMenu(false);

    if (isFullscreen) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      } catch {
        // Ignore unsupported orientation unlock
      }
      setIsFullscreen(false);
      setIsNativeFullscreen(false);
      onNotify('已退出全屏');
      return;
    }

    setIsFullscreen(true);
    if (stageRef.current?.requestFullscreen) {
      try {
        await stageRef.current.requestFullscreen();
        setIsNativeFullscreen(true);
      } catch {
        // Seamless iframe-safe viewport fullscreen fallback already active via isFullscreen
        setIsNativeFullscreen(false);
      }
    }
    onNotify('已进入全屏模式（按 Esc 退出）');
  }, [isFullscreen, onNotify]);

  const toggleLandscape = useCallback(async () => {
    setShowQualityMenu(false);
    setShowSpeedMenu(false);

    const next = !isLandscape;
    setIsLandscape(next);
    setHudVisible(true);

    // Attempt native orientation lock when supported on mobile browsers
    const orientationApi = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
      unlock?: () => void;
    };

    if (next) {
      try {
        await orientationApi?.lock?.('landscape');
      } catch {
        // Gracefully falls back to responsive 16:9 widescreen / rotated mobile stage
      }
      onNotify('已切换横屏影院模式');
    } else {
      try {
        orientationApi?.unlock?.();
      } catch {
        // Ignore
      }
      onNotify('已恢复竖屏刷剧模式');
    }
  }, [isLandscape, onNotify]);

  // Sync local ref for flush on unmount / switch
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Reset per-episode state cleanly when drama or episode changes
  useEffect(() => {
    const startSec =
      initialTimeSeconds > 0 && initialTimeSeconds < episode.durationSeconds - 3
        ? initialTimeSeconds
        : 0;
    setCurrentTime(startSec);
    currentTimeRef.current = startSec;
    setDuration(episode.durationSeconds);
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

  // Trigger silent next-episode preload once playback passes 40% or final 20s (HongGuo architecture)
  useEffect(() => {
    if (!nextEpisode || preloadTriggered) return;
    const ratio = duration > 0 ? currentTime / duration : 0;
    const remaining = duration - currentTime;
    if (ratio >= 0.4 || (duration > 15 && remaining <= 20)) {
      preloadNextEpisode(drama.id, nextEpisode, apiBaseUrl);
      setPreloadTriggered(true);
    }
  }, [apiBaseUrl, currentTime, duration, drama.id, nextEpisode, preloadTriggered]);

  // Cancel in-flight preload requests when leaving theater
  useEffect(() => {
    return () => {
      cancelPendingPreloads();
    };
  }, []);

  const handleNextEpisodeOrDrama = useCallback(() => {
    if (nextEpisode) {
      onSelectDramaEpisode(drama.id, nextEpisode.number, 0);
      onNotify(`正在连播 第 ${nextEpisode.number} 集`);
      return;
    }

    const currentIdx = dramas.findIndex((item) => item.id === drama.id);
    const nextDrama = dramas[(currentIdx + 1) % dramas.length];
    if (nextDrama && nextDrama.id !== drama.id) {
      onSelectDramaEpisode(nextDrama.id, 1, 0);
      onNotify(`已切换至《${nextDrama.title}》`);
    }
  }, [drama.id, dramas, nextEpisode, onNotify, onSelectDramaEpisode]);

  const handlePrevEpisodeOrDrama = useCallback(() => {
    if (episode.number > 1) {
      onSelectDramaEpisode(drama.id, episode.number - 1, 0);
      return;
    }
    const currentIdx = dramas.findIndex((item) => item.id === drama.id);
    const prevDrama = dramas[(currentIdx - 1 + dramas.length) % dramas.length];
    if (prevDrama && prevDrama.id !== drama.id) {
      onSelectDramaEpisode(prevDrama.id, 1, 0);
      onNotify(`已切换至《${prevDrama.title}》`);
    }
  }, [drama.id, dramas, episode.number, onNotify, onSelectDramaEpisode]);

  // External HLS / MP4 playback lifecycle with ABR and automatic stall recovery
  useEffect(() => {
    if (!hasExternalStream) return;
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
            if ((isM3u8 && cdn.m3u8Enabled !== false) || (isOther && cdn.otherEnabled)) {
              try {
                xhr.setRequestHeader(cdn.authKey, cdn.authValue);
                if (cdn.app) xhr.setRequestHeader('x-cdn-app', cdn.app);
              } catch {
                // Ignore if header cannot be set in current state
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
          onNotify('网络波动，已自动切换至流畅清晰度');
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

  // Apply HLS manual quality preference cleanly when changed
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

  // Sync play/pause, playback rate, and mute to real <video>
  useEffect(() => {
    if (!hasExternalStream || !videoRef.current) return;
    const video = videoRef.current;
    video.playbackRate = playbackRate;
    video.muted = isMuted;
    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [hasExternalStream, isPlaying, playbackRate, isMuted]);

  // Built-in smooth GPU storyboard playback clock
  useEffect(() => {
    if (hasExternalStream || !isPlaying) return;

    const intervalMs = 250;
    const timer = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + (intervalMs / 1000) * playbackRate;
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
    drama.id,
    duration,
    episode.number,
    handleNextEpisodeOrDrama,
    hasExternalStream,
    isPlaying,
    onRecordProgress,
    playbackRate,
  ]);

  const handleSeek = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      currentTimeRef.current = seconds;
      if (hasExternalStream && videoRef.current) {
        videoRef.current.currentTime = seconds;
      }
      onRecordProgress(drama.id, episode.number, seconds, duration, true);
      pokeHud();
    },
    [drama.id, duration, episode.number, hasExternalStream, onRecordProgress, pokeHud]
  );

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (!next) {
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
  }, [drama.id, duration, episode.number, onRecordProgress, pokeHud]);

  // Keyboard shortcuts: Space, F (Fullscreen), L (Landscape), Escape, Arrows
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
        if (showEpisodeSheet) {
          setShowEpisodeSheet(false);
        } else if (isFullscreen && !document.fullscreenElement) {
          setIsFullscreen(false);
          onNotify('已退出全屏');
        } else if (isLandscape) {
          setIsLandscape(false);
          onNotify('已恢复竖屏刷剧模式');
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
    toggleFullscreen,
    toggleLandscape,
    togglePlayPause,
  ]);

  // Gesture State Machine: Double-tap, Long-press speed, Volume/Brightness, Horizontal Seek, and Vertical Swipe
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const stage = stageRef.current;
    const rect = stage?.getBoundingClientRect();
    const stageW = rect?.width || window.innerWidth;
    const stageH = rect?.height || window.innerHeight;
    const touchX = touch.clientX - (rect?.left || 0);
    const touchY = touch.clientY - (rect?.top || 0);

    pokeHud();

    const now = Date.now();
    const tapInterval = now - lastTapTimeRef.current;
    const dist = Math.hypot(
      touch.clientX - lastTapPosRef.current.x,
      touch.clientY - lastTapPosRef.current.y
    );

    // Double-tap to like: < 280ms and dist < 35px
    if (tapInterval < 280 && dist < 35) {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      gestureTypeRef.current = 'none';
      lastTapTimeRef.current = 0;

      // Spawn animated floating heart at touch coordinates
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

      // Trigger 20ms haptic feedback
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
      time: now,
      stageW,
      stageH,
      startBrightness: brightness,
      startVolume: videoRef.current ? videoRef.current.volume : volume,
      startSeekTime: currentTimeRef.current,
    };

    // Long press > 450ms activates 2.0x boost
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      if (gestureTypeRef.current === 'none') {
        gestureTypeRef.current = 'long_press';
        setIsSpeedBoosting(true);
        if (videoRef.current) {
          videoRef.current.playbackRate = 2.0;
        }
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(20);
        }
      }
    }, 450);
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

    // If movement > 10px, cancel long-press timer
    if (Math.hypot(dx, dy) > 10 && longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (gestureTypeRef.current === 'long_press') {
      return;
    }

    // Identify gesture type if not locked yet
    if (gestureTypeRef.current === 'none') {
      if (absDx > 15 && absDx > absDy * 1.2) {
        gestureTypeRef.current = 'seek';
      } else if (absDy > 15 && absDy > absDx * 1.2) {
        const rect = stageRef.current?.getBoundingClientRect();
        const relStartX = start.x - (rect?.left || 0);
        if (relStartX < start.stageW * 0.35) {
          gestureTypeRef.current = 'brightness';
        } else if (relStartX > start.stageW * 0.65) {
          gestureTypeRef.current = 'volume';
        } else {
          gestureTypeRef.current = 'swipe';
        }
      }
    }

    if (gestureTypeRef.current === 'seek') {
      const deltaSec = (dx / start.stageW) * Math.min(120, duration * 0.4);
      const targetTime = Math.max(0, Math.min(duration, start.startSeekTime + deltaSec));
      setSeekHUD({
        visible: true,
        targetTime,
        deltaSeconds: deltaSec,
      });
    } else if (gestureTypeRef.current === 'brightness') {
      const nextB = Math.max(0.15, Math.min(1.0, start.startBrightness - (dy / start.stageH) * 1.3));
      setBrightness(nextB);
      setIsAdjustingBrightness(true);
      if (brightnessTimerRef.current) window.clearTimeout(brightnessTimerRef.current);
    } else if (gestureTypeRef.current === 'volume') {
      const nextV = Math.max(0, Math.min(1.0, start.startVolume - (dy / start.stageH) * 1.3));
      setVolume(nextV);
      setIsAdjustingVolume(true);
      if (videoRef.current) {
        videoRef.current.volume = nextV;
        if (nextV > 0 && isMuted) setIsMuted(false);
      }
      if (volumeTimerRef.current) window.clearTimeout(volumeTimerRef.current);
    } else if (gestureTypeRef.current === 'swipe') {
      setIsDraggingEpisode(true);
      const isBoundary =
        (episode.number <= 1 && dy > 0) ||
        (episode.number >= drama.episodes.length && dy < 0);
      const effectiveDy = isBoundary ? dy * 0.25 : dy * 0.8;
      setDragDeltaY(effectiveDy);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (gestureTypeRef.current === 'long_press') {
      setIsSpeedBoosting(false);
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gestureTypeRef.current === 'seek') {
      if (seekHUD) {
        handleSeek(seekHUD.targetTime);
        setSeekHUD(null);
      }
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gestureTypeRef.current === 'brightness') {
      brightnessTimerRef.current = window.setTimeout(() => {
        setIsAdjustingBrightness(false);
      }, 700);
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gestureTypeRef.current === 'volume') {
      volumeTimerRef.current = window.setTimeout(() => {
        setIsAdjustingVolume(false);
      }, 700);
      gestureTypeRef.current = 'none';
      touchStartRef.current = null;
      return;
    }

    if (gestureTypeRef.current === 'swipe') {
      const currentDy = dragDeltaY;
      setDragDeltaY(0);
      setIsDraggingEpisode(false);

      if (currentDy < -65) {
        if (episode.number >= drama.episodes.length) {
          onNotify('已经是最后一集了');
        } else {
          handleNextEpisodeOrDrama();
        }
      } else if (currentDy > 65) {
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

    gestureTypeRef.current = 'none';
    touchStartRef.current = null;
  };

  const handleShare = async () => {
    const shareText = `正在黄果短剧观看《${drama.title}》第 ${episode.number} 集`;
    try {
      await navigator.clipboard.writeText(
        `${shareText} · ${window.location.href}`
      );
      onNotify('剧集链接已复制到剪贴板');
    } catch {
      onNotify(shareText);
    }
  };

  // Fallback poster state with cleanCoverUrl and local demo poster fallback
  const preferredPoster = useMemo(() => {
    return effectiveLandscape && drama.heroUrl
      ? drama.heroUrl
      : (episode.posterUrl ?? drama.posterUrl);
  }, [drama.heroUrl, drama.posterUrl, effectiveLandscape, episode.posterUrl]);

  const [decryptedPosterUrl, setDecryptedPosterUrl] = useState<string>(() => getCachedDecryptedUrl(preferredPoster) || '');
  const [posterStage, setPosterStage] = useState<'decrypting' | 'ready' | 'fallback' | 'placeholder'>(() => {
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

  const handlePosterError = () => {
    setPosterStage('placeholder');
  };

  // Pick visual frame: in landscape demo mode prefer widescreen hero visual when available
  const storyboardFrames = useMemo(() => {
    const base = episode.storyboardImages?.length
      ? episode.storyboardImages
      : [episode.posterUrl ?? drama.posterUrl];
    if (effectiveLandscape && drama.heroUrl && !base.includes(drama.heroUrl)) {
      return [drama.heroUrl, ...base];
    }
    return base;
  }, [drama.heroUrl, drama.posterUrl, effectiveLandscape, episode.posterUrl, episode.storyboardImages]);

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
  }, [rawActiveFrameUrl, failedFrames, drama.id]);

  const handleActiveFrameError = () => {
    setFailedFrames((prev) => new Set(prev).add(rawActiveFrameUrl));
  };

  const mediaFitClass = fitMode === 'contain' ? 'object-contain' : 'object-cover';

  // Compute responsive stage classes across:
  // 1) Immersive Fullscreen (native or iframe-safe viewport fullscreen)
  // 2) Rotated Mobile Landscape (90deg full-viewport rotation on portrait phones)
  // 3) Device Landscape (physically rotated phone)
  // 4) Desktop Widescreen Landscape Cinema (16:9 wide stage)
  // 5) Default Vertical 9:16 Theater Stage
  const stageContainerClass = isFullscreen
    ? 'fixed inset-0 z-50 w-screen h-[100dvh] rounded-none border-0 bg-black'
    : isRotatedMobileLandscape
      ? 'fixed top-1/2 left-1/2 z-50 w-[100dvh] h-[100vw] -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center rounded-none border-0 bg-black'
      : isDeviceLandscape
        ? 'fixed inset-0 z-50 w-screen h-[100dvh] rounded-none border-0 bg-black'
        : isLandscape
          ? 'relative w-full aspect-video max-h-[78dvh] rounded-2xl lg:rounded-3xl bg-black border border-white/[0.1]'
          : 'relative w-full h-[calc(100dvh-64px)] lg:h-[calc(100dvh-116px)] lg:max-h-[820px] lg:w-[430px] xl:w-[460px] lg:rounded-3xl bg-black border-0 lg:border lg:border-white/[0.1] shrink-0';

  const showSideEpisodeDrawer = isFullscreen || effectiveLandscape;
  const isControlsVisible = !isCleanMode && hudVisible;

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
        {/* Main Theater Stage (Supports Vertical, Landscape Widescreen, and True/Immersive Fullscreen) */}
        <div
          id="theater-stage"
          data-testid="theater-stage"
          ref={stageRef}
          onMouseMove={pokeHud}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={`${stageContainerClass} overflow-hidden select-none`}
        >
          {/* Gestural Vertical Drag & Peeking Canvas */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden"
            style={{
              transform: dragDeltaY !== 0 ? `translate3d(0, ${dragDeltaY}px, 0)` : undefined,
              transition: isDraggingEpisode
                ? 'none'
                : 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Ambient Blurred Backdrop when in "适应 (contain)" mode so pillarbox/letterbox feels cinematic */}
            {fitMode === 'contain' && (
              <img
                src={activeFrameUrl}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-30 pointer-events-none"
              />
            )}

            {/* Poster-to-First-Frame Zero-Black-Flash Layer */}
            {posterStage !== 'placeholder' && resolvedPosterUrl ? (
              <img
                src={resolvedPosterUrl}
                alt={drama.title}
                referrerPolicy="no-referrer"
                onError={handlePosterError}
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
                <span className="text-sm font-semibold text-slate-100 line-clamp-1">{drama.title}</span>
                <span className="text-xs text-slate-400 mt-1">第 {episode.number} 集</span>
              </div>
            )}

            {/* Mode A: Real HLS / MP4 Video Stream */}
            {hasExternalStream ? (
              <video
                ref={videoRef}
                playsInline
                preload="auto"
                poster={resolvedPosterUrl || undefined}
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration;
                  if (Number.isFinite(dur) && dur > 0) setDuration(dur);
                }}
                onPlaying={() => {
                  setVideoReady(true);
                  setIsBuffering(false);
                  setStreamError(null);
                }}
                onWaiting={() => setIsBuffering(true)}
                onStalled={() => setIsBuffering(true)}
                onTimeUpdate={(e) => {
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
                  onRecordProgress(drama.id, episode.number, duration, duration, true);
                  if (autoAdvance) {
                    handleNextEpisodeOrDrama();
                  } else {
                    setIsPlaying(false);
                  }
                }}
                onError={() => {
                  setIsBuffering(false);
                  setStreamError('片源流无法直接播放，建议切换其他极速直连线路或使用剧照预览播放。');
                }}
                className={`absolute inset-0 h-full w-full ${mediaFitClass} transition-opacity duration-200 ${
                  videoReady ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              /* Mode B: Built-in 60fps GPU-Composited Storyboard Preview Engine */
              <div className="absolute inset-0 overflow-hidden">
                <img
                  key={`${drama.id}-${episode.number}-${sceneIndex}-${fitMode}`}
                  src={activeFrameUrl}
                  alt={`${drama.title} 第 ${episode.number} 集`}
                  referrerPolicy="no-referrer"
                  onError={handleActiveFrameError}
                  className={`h-full w-full ${mediaFitClass} ${
                    sceneIndex % 2 === 0 ? 'animate-cinema-in' : 'animate-cinema-out'
                  } ${!isPlaying ? 'cinema-paused' : ''}`}
                />
              </div>
            )}
          </div>

          {/* Screen Brightness Overlay Filter (Hardware Accelerated) */}
          <div
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-75 z-20"
            style={{ opacity: Math.max(0, 1 - brightness) }}
            aria-hidden="true"
          />

          {/* Floating Bursting Hearts on Double-Tap */}
          <FloatingHearts hearts={hearts} />

          {/* Gestures HUD Overlays */}
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
          />

          {/* Clean Screen Mode Floating Exit Button */}
          {isCleanMode && (
            <div className="absolute bottom-6 right-6 z-40 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => {
                  setIsCleanMode(false);
                  pokeHud();
                }}
                aria-label="退出清屏"
                className="px-3.5 py-1.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-xs text-white font-medium inline-flex items-center gap-1.5 shadow-2xl active:scale-95 transition-all"
              >
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span>退出清屏</span>
              </button>
            </div>
          )}

          {/* Measured Cinematic Scrims (auto-fade with HUD in immersive modes) */}
          <div
            className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none transition-opacity duration-200 ${
              isControlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none transition-opacity duration-200 ${
              isControlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Center Tap Zone for Play/Pause (or Wake HUD in Immersive Mode) */}
          <button
            type="button"
            onClick={() => {
              setShowQualityMenu(false);
              setShowSpeedMenu(false);
              if (isCleanMode) {
                setIsCleanMode(false);
                pokeHud();
                return;
              }
              if (!hudVisible) {
                pokeHud();
                return;
              }
              togglePlayPause();
            }}
            onDoubleClick={() => {
              void toggleFullscreen();
            }}
            aria-label={isPlaying ? '暂停播放' : '继续播放'}
            className="absolute inset-0 z-10 w-full h-full flex items-center justify-center focus:outline-none"
          >
            {!isPlaying && !streamError && !isCleanMode && (
              <span className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-transform duration-150 scale-100">
                <Play className="w-7 h-7 fill-current ml-1" aria-hidden="true" />
              </span>
            )}
          </button>

          {/* Buffering Indicator */}
          {isBuffering && !streamError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 flex items-center gap-2 text-xs text-slate-100">
                <Loader2
                  className="w-4 h-4 animate-spin text-amber-400"
                  aria-hidden="true"
                />
                <span>缓冲中...</span>
              </div>
            </div>
          )}

          {/* Recoverable Stream Error Overlay */}
          {streamError && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
              <div className="max-w-sm w-full rounded-2xl bg-[#14161D] border border-white/10 p-5 text-center space-y-4 shadow-2xl">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 mx-auto flex items-center justify-center">
                  <Film className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">视频播放提示</h4>
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
                    className="min-h-[42px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0B0C10] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>重新解析 / 重试播放</span>
                  </button>
                  {onOpenLineSelector && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenLineSelector();
                      }}
                      className="min-h-[38px] w-full rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>切换其他直连极速线路</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStreamError(null);
                      setUseFallbackPlayback(true);
                      onNotify('已切换至剧照预览播放模式');
                    }}
                    className="min-h-[38px] w-full rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>切换至剧照预览播放</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Top Bar inside Stage */}
          <div
            className={`absolute top-0 inset-x-0 z-20 p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-opacity duration-200 ${
              isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="min-w-0 flex items-center gap-2.5">
              {(isFullscreen || isRotatedMobileLandscape) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isFullscreen) {
                      void toggleFullscreen();
                    } else if (isLandscape) {
                      void toggleLandscape();
                    }
                  }}
                  aria-label="退出沉浸视图"
                  className="min-h-[40px] min-w-[40px] rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-md text-white flex items-center justify-center transition-colors shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {drama.title}
                </p>
                <p className="text-xs text-slate-300 font-mono tabular-nums truncate">
                  第 {episode.number} 集 <span aria-hidden="true">·</span>{' '}
                  {episode.title}
                </p>
                {useFallbackPlayback && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-[10px] text-amber-300 font-medium">
                      <Film className="w-2.5 h-2.5" />
                      <span>剧照预览模式</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUseFallbackPlayback(false);
                        setRetryToken((n) => n + 1);
                      }}
                      className="text-[10px] text-slate-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                    >
                      重试视频流
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenLineSelector && (
                <button
                  type="button"
                  onClick={onOpenLineSelector}
                  aria-label="切换播放线路"
                  className="min-h-[38px] px-2.5 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md text-amber-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>线路</span>
                </button>
              )}

              {(isFullscreen || effectiveLandscape) && (
                <button
                  type="button"
                  onClick={() => {
                    const nextFit: FitMode = fitMode === 'cover' ? 'contain' : 'cover';
                    setFitMode(nextFit);
                    onNotify(nextFit === 'contain' ? '画面比例：完整适应' : '画面比例：铺满屏幕');
                  }}
                  aria-label="切换画面填充比例"
                  className="min-h-[40px] px-3 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-md text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Ratio className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>{fitMode === 'cover' ? '铺满' : '适应'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handlePrevEpisodeOrDrama}
                aria-label="上一集"
                className="min-h-[40px] min-w-[40px] rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md text-white flex items-center justify-center transition-colors"
              >
                <ChevronUp className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNextEpisodeOrDrama}
                aria-label="下一集"
                className="min-h-[40px] min-w-[40px] rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md text-white flex items-center justify-center transition-colors"
              >
                <ChevronDown className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Right-Edge Ergonomic Thumb Action Rail (Portrait Mode Only; in Landscape/Fullscreen actions move to bottom bar to keep cinema frame wide open) */}
          {!effectiveLandscape && !isFullscreen && (
            <div
              className={`absolute right-3 bottom-36 z-20 flex flex-col items-center gap-2.5 transition-opacity duration-200 ${
                isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleLike(drama.id, episode.number)}
                aria-label={isLiked ? '取消点赞' : '点赞本集'}
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-transform"
              >
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                    isLiked
                      ? 'bg-amber-500/25 border-amber-400/50 text-amber-400'
                      : 'bg-black/45 border-white/15 text-white hover:bg-black/65'
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-100">
                  {formatLikes(likeCount)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleFollow(drama.id)}
                aria-label={isFollowed ? '取消追剧' : '加入追剧'}
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-transform"
              >
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                    isFollowed
                      ? 'bg-amber-500/25 border-amber-400/50 text-amber-400'
                      : 'bg-black/45 border-white/15 text-white hover:bg-black/65'
                  }`}
                >
                  {isFollowed ? (
                    <BookmarkCheck className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Bookmark className="w-5 h-5" aria-hidden="true" />
                  )}
                </span>
                <span className="text-[11px] text-slate-100">
                  {isFollowed ? '已追剧' : '追剧'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowEpisodeSheet(true)}
                aria-label="打开选集"
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-transform"
              >
                <span className="w-11 h-11 rounded-full bg-black/45 border border-white/15 hover:bg-black/65 backdrop-blur-md flex items-center justify-center">
                  <ListVideo className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-[11px] text-slate-100">选集</span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                aria-label="分享剧集"
                className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-transform"
              >
                <span className="w-11 h-11 rounded-full bg-black/45 border border-white/15 hover:bg-black/65 backdrop-blur-md flex items-center justify-center">
                  <Share2 className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-[11px] text-slate-100">分享</span>
              </button>
            </div>
          )}

          {/* Bottom Info + Isolated Progress & Full Controls */}
          <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-3.5 sm:pb-4 pt-2 space-y-2.5">
            {isControlsVisible && !effectiveLandscape && !isFullscreen && (
              <div className="pr-16 space-y-1">
                <p className="text-xs text-slate-200/95 line-clamp-2 leading-relaxed">
                  {episode.hook || drama.tagline}
                </p>
                <p className="text-[11px] text-slate-400">
                  {drama.category} <span aria-hidden="true">·</span>{' '}
                  {drama.genres.join(' / ')}
                  {nextEpisode && preloadTriggered && (
                    <>
                      {' '}
                      <span aria-hidden="true">·</span> 下一集已预加载
                    </>
                  )}
                </p>
              </div>
            )}

            <PlayerProgressOverlay
              currentTime={currentTime}
              duration={duration}
              bufferedRatio={bufferedRatio}
              subtitlesEnabled={subtitlesEnabled}
              subtitles={episode.subtitles}
              onSeek={handleSeek}
              showControls={isControlsVisible}
            />

            {/* Bottom Playback Control Strip (Includes Landscape & Fullscreen Controls) */}
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
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center transition-colors shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Play
                      className="w-4 h-4 fill-current ml-0.5"
                      aria-hidden="true"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? '取消静音' : '静音'}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center transition-colors shrink-0"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-slate-300" aria-hidden="true" />
                  ) : (
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                {/* Inline Like & Follow when in Landscape / Fullscreen */}
                {(effectiveLandscape || isFullscreen) && (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleLike(drama.id, episode.number)}
                      aria-label={isLiked ? '取消点赞' : '点赞'}
                      className={`min-h-[40px] px-2.5 rounded-xl text-xs font-mono tabular-nums inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        isLiked
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`}
                        aria-hidden="true"
                      />
                      <span className="hidden sm:inline">{formatLikes(likeCount)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleFollow(drama.id)}
                      aria-label={isFollowed ? '取消追剧' : '加入追剧'}
                      className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        isFollowed
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      {isFollowed ? (
                        <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">
                        {isFollowed ? '已追剧' : '追剧'}
                      </span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 relative">
                {/* Auto-advance toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoAdvance;
                    setAutoAdvance(next);
                    onNotify(next ? '自动连播已开启' : '自动连播已关闭');
                  }}
                  aria-pressed={autoAdvance}
                  aria-label="切换自动连播"
                  className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    autoAdvance
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      autoAdvance ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  <span>连播</span>
                </button>

                {/* Clean mode toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setIsCleanMode(true);
                    onNotify('已开启清屏模式，点击右下角按钮退出');
                  }}
                  aria-label="清屏模式"
                  className="min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span className="hidden sm:inline">清屏</span>
                </button>

                {/* Episode drawer button in Landscape / Fullscreen */}
                {(effectiveLandscape || isFullscreen) && (
                  <button
                    type="button"
                    onClick={() => setShowEpisodeSheet(true)}
                    className="min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                  >
                    <ListVideo className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>选集</span>
                  </button>
                )}

                {/* Subtitle toggle */}
                <button
                  type="button"
                  onClick={() => setSubtitlesEnabled((s) => !s)}
                  aria-pressed={subtitlesEnabled}
                  aria-label="切换字幕"
                  className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    subtitlesEnabled
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Captions className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">字幕</span>
                </button>

                {/* Playback speed selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSpeedMenu((v) => !v);
                      setShowQualityMenu(false);
                    }}
                    aria-label="切换倍速"
                    className="min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono tabular-nums text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Gauge className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>{playbackRate}x</span>
                  </button>

                  {showSpeedMenu && (
                    <div className="absolute bottom-12 right-0 w-24 rounded-2xl bg-[#1D202A]/95 backdrop-blur-md border border-white/15 p-1.5 shadow-xl space-y-1 z-30">
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => {
                            setPlaybackRate(rate);
                            setShowSpeedMenu(false);
                            onNotify(`已切换为 ${rate}x 倍速`);
                          }}
                          className={`w-full min-h-[36px] rounded-xl text-xs font-mono tabular-nums transition-colors ${
                            playbackRate === rate
                              ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                              : 'text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQualityMenu((v) => !v);
                      setShowSpeedMenu(false);
                    }}
                    aria-label="切换清晰度"
                    className="min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>
                      {QUALITY_OPTIONS.find((q) => q.value === preferredQuality)
                        ?.label ?? '自动'}
                    </span>
                  </button>

                  {showQualityMenu && (
                    <div className="absolute bottom-12 right-0 w-28 rounded-2xl bg-[#1D202A]/95 backdrop-blur-md border border-white/15 p-1.5 shadow-xl space-y-1 z-30">
                      {QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onChangeQuality(opt.value);
                            setShowQualityMenu(false);
                            onNotify(`清晰度已设为 ${opt.label}`);
                          }}
                          className={`w-full min-h-[36px] rounded-xl text-xs font-medium transition-colors ${
                            preferredQuality === opt.value
                              ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                              : 'text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Landscape / Portrait Cinema Mode Toggle */}
                <button
                  type="button"
                  onClick={() => void toggleLandscape()}
                  aria-pressed={effectiveLandscape}
                  aria-label={effectiveLandscape ? '切换竖屏模式' : '切换横屏模式'}
                  className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    effectiveLandscape
                      ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                      : 'bg-white/10 hover:bg-white/15 text-white'
                  }`}
                >
                  {effectiveLandscape ? (
                    <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  )}
                  <span className="hidden xs:inline sm:inline">
                    {effectiveLandscape ? '竖屏' : '横屏'}
                  </span>
                </button>

                {/* Fullscreen Mode Toggle */}
                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  aria-pressed={isFullscreen}
                  aria-label={isFullscreen ? '退出全屏' : '全屏播放'}
                  className={`min-h-[40px] min-w-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    isFullscreen
                      ? 'bg-amber-500 text-[#0B0C10] font-semibold'
                      : 'bg-white/10 hover:bg-white/15 text-white'
                  }`}
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Maximize className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {isFullscreen ? '退出全屏' : '全屏'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Episode Overlay Inside Stage (Ensures Native Fullscreen & Landscape Show the Drawer Cleanly!) */}
          {showEpisodeSheet && (
            <div
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
                    ? 'w-80 sm:w-96 max-w-[85%] h-full bg-[#14161D]/95 backdrop-blur-md border-l border-white/15 p-5 flex flex-col'
                    : 'w-full max-w-xl max-h-[75vh] rounded-t-3xl bg-[#14161D] border-t border-white/15 px-5 pt-3 pb-6 flex flex-col shadow-2xl'
                }
              >
                {!showSideEpisodeDrawer && (
                  <div className="w-10 h-1.5 rounded-full bg-slate-600 mx-auto mb-3 shrink-0" />
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
        </div>

        {/* Desktop Side Panel (Vertical Mode) OR Wide Episode Strip Below Stage (Desktop Landscape Cinema Mode) */}
        {!isImmersiveOverlay && (
          <aside
            className={
              isLandscape
                ? 'rounded-3xl bg-[#14161D] border border-white/[0.08] p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
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
                  <p className="text-xs text-slate-400 mt-1">
                    {drama.category} <span aria-hidden="true">·</span>{' '}
                    {drama.genres.join(' / ')} <span aria-hidden="true">·</span>{' '}
                    {drama.releaseYear}
                  </p>
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
                <span>支持 F 全屏 · L 切换横屏影院</span>
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
