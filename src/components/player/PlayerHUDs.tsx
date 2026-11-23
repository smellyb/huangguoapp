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
    <div className="absolute top-16 sm:top-20 inset-x-0 z-40 flex justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
      <div className="px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/40 text-amber-300 shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-wide">
        <span className="text-base animate-bounce">🚀</span>
        <span>{rate}X 快进中</span>
        <FastForward className="w-3.5 h-3.5 fill-current animate-pulse ml-0.5" />
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
      className={`absolute top-1/2 -translate-y-1/2 z-40 pointer-events-none transition-opacity duration-200 ${
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
              type === 'brightness' ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
            style={{ height: `${percent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono tabular-nums text-slate-200 font-medium">
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
  const deltaText = `${isPositive ? '+' : '-'}${Math.abs(
    Math.round(deltaSeconds)
  )}s`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="px-5 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-2xl flex flex-col items-center gap-2 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white font-mono tabular-nums">
            {formatTime(targetTime)}
          </span>
          <span className="text-xs text-slate-400">/</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-semibold font-mono tabular-nums ${
              isPositive ? 'text-amber-400' : 'text-slate-300'
            }`}
          >
            {deltaText}
          </span>
        </div>

        <div className="w-36 h-1.5 rounded-full bg-white/20 overflow-hidden mt-0.5">
          <div
            className="h-full bg-amber-500 rounded-full transition-[width] duration-75"
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
}

export const SwipePeekIndicator = memo(function SwipePeekIndicator({
  dragDeltaY,
  currentEpisode,
  totalEpisodes,
  nextEpisodeTitle,
  prevEpisodeTitle,
}: SwipePeekIndicatorProps) {
  if (Math.abs(dragDeltaY) < 15) return null;

  const isSwipingUp = dragDeltaY < 0; // Swiping up reveals next episode
  const isBoundary = isSwipingUp
    ? currentEpisode >= totalEpisodes
    : currentEpisode <= 1;

  if (isSwipingUp) {
    return (
      <div className="absolute bottom-16 inset-x-0 z-30 flex justify-center pointer-events-none transition-all duration-100">
        <div
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-1.5 shadow-lg border ${
            isBoundary
              ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
              : 'bg-black/75 border-amber-500/40 text-amber-300'
          }`}
        >
          <ChevronUp className="w-3.5 h-3.5 animate-bounce" />
          <span>
            {isBoundary
              ? '已经是最后一集了'
              : `上滑播放 第 ${currentEpisode + 1} 集 ${
                  nextEpisodeTitle ? `· ${nextEpisodeTitle}` : ''
                }`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-16 inset-x-0 z-30 flex justify-center pointer-events-none transition-all duration-100">
      <div
        className={`px-3.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-1.5 shadow-lg border ${
          isBoundary
            ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
            : 'bg-black/75 border-amber-500/40 text-amber-300'
        }`}
      >
        <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
        <span>
          {isBoundary
            ? '已经是第一集了'
            : `下拉播放 第 ${currentEpisode - 1} 集 ${
                prevEpisodeTitle ? `· ${prevEpisodeTitle}` : ''
              }`}
        </span>
      </div>
    </div>
  );
});
