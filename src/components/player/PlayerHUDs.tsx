import { memo } from 'react';
import {
  SunMedium,
  Volume1,
  Volume2,
  VolumeX,
  FastForward,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface SpeedBoostHUDProps {
  visible: boolean;
  rate?: number;
}

export const SpeedBoostHUD = memo(function SpeedBoostHUD({
  visible,
  rate = 2.0,
}: SpeedBoostHUDProps) {
  if (!visible) return null;

  return (
    <div className="absolute top-[calc(env(safe-area-inset-top,0px)+60px)] inset-x-0 z-40 flex justify-center pointer-events-none">
      <div className="px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/35 text-amber-300 shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-wide font-mono tabular-nums">
        <FastForward className="w-4 h-4 fill-current" aria-hidden="true" />
        <span>{rate.toFixed(1)}x 倍速播放中</span>
      </div>
    </div>
  );
});

interface VerticalSliderHUDProps {
  visible: boolean;
  type: 'brightness' | 'volume';
  value: number; // 0 to 1
  isMuted?: boolean;
}

export const VerticalSliderHUD = memo(function VerticalSliderHUD({
  visible,
  type,
  value,
  isMuted = false,
}: VerticalSliderHUDProps) {
  if (!visible) return null;

  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const isLeft = type === 'brightness';

  const renderIcon = () => {
    if (type === 'brightness') {
      return <SunMedium className="w-5 h-5 text-amber-400" aria-hidden="true" />;
    }
    if (isMuted || percent === 0) {
      return <VolumeX className="w-5 h-5 text-red-400" aria-hidden="true" />;
    }
    if (percent < 50) {
      return <Volume1 className="w-5 h-5 text-slate-200" aria-hidden="true" />;
    }
    return <Volume2 className="w-5 h-5 text-amber-400" aria-hidden="true" />;
  };

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 z-40 pointer-events-none transition-opacity duration-150 ${
        isLeft ? 'left-5 sm:left-7' : 'right-5 sm:right-7'
      }`}
    >
      <div className="flex flex-col items-center gap-2 p-2.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 shadow-2xl">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          {renderIcon()}
        </div>
        <div className="w-1.5 h-24 rounded-full bg-white/20 overflow-hidden relative flex flex-col justify-end">
          <div
            className={`w-full transition-[height] duration-75 rounded-full ${
              type === 'brightness' ? 'bg-amber-400' : 'bg-slate-100'
            }`}
            style={{ height: `${percent}%` }}
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-200 font-medium">
          {percent}%
        </span>
      </div>
    </div>
  );
});

interface SeekHUDProps {
  visible: boolean;
  targetTime: number;
  duration: number;
  deltaSeconds: number;
}

export const SeekHUD = memo(function SeekHUD({
  visible,
  targetTime,
  duration,
  deltaSeconds,
}: SeekHUDProps) {
  if (!visible) return null;

  const progressPercent =
    duration > 0 ? Math.min(100, (targetTime / duration) * 100) : 0;
  const isPositive = deltaSeconds >= 0;
  const deltaText =
    Math.abs(Math.round(deltaSeconds)) > 0
      ? `${isPositive ? '+' : '-'}${Math.abs(Math.round(deltaSeconds))}s`
      : '拖动定位';

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="px-5 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/15 shadow-2xl flex flex-col items-center gap-2 min-w-[168px]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-white font-mono tabular-nums">
            {formatTime(targetTime)}
          </span>
          <span className="text-xs text-slate-500">/</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        <span
          className={`text-xs font-semibold font-mono tabular-nums ${
            isPositive ? 'text-amber-400' : 'text-slate-300'
          }`}
        >
          {deltaText}
        </span>

        <div className="w-36 h-1.5 rounded-full bg-white/20 overflow-hidden mt-0.5">
          <div
            className="h-full bg-amber-400 rounded-full transition-[width] duration-75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
});

interface SwipePeekIndicatorProps {
  dragDeltaY: number;
  currentEpisode: number;
  totalEpisodes: number;
  nextEpisodeTitle?: string;
  prevEpisodeTitle?: string;
  hasNextDrama?: boolean;
}

export const SwipePeekIndicator = memo(function SwipePeekIndicator({
  dragDeltaY,
  currentEpisode,
  totalEpisodes,
  nextEpisodeTitle,
  prevEpisodeTitle,
  hasNextDrama = false,
}: SwipePeekIndicatorProps) {
  if (Math.abs(dragDeltaY) < 16) return null;

  const isSwipingUp = dragDeltaY < 0;
  const readyToTrigger = Math.abs(dragDeltaY) >= 56;
  const isBoundary = isSwipingUp
    ? currentEpisode >= totalEpisodes && !hasNextDrama
    : currentEpisode <= 1;

  if (isSwipingUp) {
    const label = isBoundary
      ? '已经是最后一集'
      : currentEpisode >= totalEpisodes && hasNextDrama
        ? readyToTrigger
          ? '松手切换下一部热剧'
          : '上滑切换下一部热剧'
        : `${readyToTrigger ? '松手播放' : '上滑播放'} 第 ${currentEpisode + 1} 集${
            nextEpisodeTitle && nextEpisodeTitle !== `第 ${currentEpisode + 1} 集`
              ? ` · ${nextEpisodeTitle}`
              : ''
          }`;

    return (
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+104px)] inset-x-0 z-30 flex justify-center pointer-events-none">
        <div
          className={`px-4 py-2 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-1.5 shadow-lg border transition-colors ${
            isBoundary
              ? 'bg-black/80 border-white/15 text-slate-300'
              : readyToTrigger
                ? 'bg-amber-500 text-[#0B0C10] border-amber-300 font-semibold'
                : 'bg-black/80 border-amber-400/40 text-amber-300'
          }`}
        >
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="max-w-[240px] truncate">{label}</span>
        </div>
      </div>
    );
  }

  const prevLabel = isBoundary
    ? '已经是第一集'
    : `${readyToTrigger ? '松手播放' : '下滑播放'} 第 ${currentEpisode - 1} 集${
        prevEpisodeTitle && prevEpisodeTitle !== `第 ${currentEpisode - 1} 集`
          ? ` · ${prevEpisodeTitle}`
          : ''
      }`;

  return (
    <div className="absolute top-[calc(env(safe-area-inset-top,0px)+68px)] inset-x-0 z-30 flex justify-center pointer-events-none">
      <div
        className={`px-4 py-2 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-1.5 shadow-lg border transition-colors ${
          isBoundary
            ? 'bg-black/80 border-white/15 text-slate-300'
            : readyToTrigger
              ? 'bg-amber-500 text-[#0B0C10] border-amber-300 font-semibold'
              : 'bg-black/80 border-amber-400/40 text-amber-300'
        }`}
      >
        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="max-w-[240px] truncate">{prevLabel}</span>
      </div>
    </div>
  );
});
