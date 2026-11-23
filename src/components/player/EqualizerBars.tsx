import { memo } from 'react';

interface EqualizerBarsProps {
  active: boolean;
  className?: string;
  colorClass?: string;
}

export const EqualizerBars = memo(function EqualizerBars({
  active,
  className = '',
  colorClass = 'bg-amber-400',
}: EqualizerBarsProps) {
  return (
    <div
      className={`flex items-end justify-center gap-0.5 w-3.5 h-3.5 ${className}`}
      aria-hidden="true"
    >
      <span
        className={`w-0.5 rounded-full transition-all duration-200 ${colorClass} ${
          active ? 'animate-eq-1' : 'h-1.5'
        }`}
      />
      <span
        className={`w-0.5 rounded-full transition-all duration-200 ${colorClass} ${
          active ? 'animate-eq-2' : 'h-3'
        }`}
      />
      <span
        className={`w-0.5 rounded-full transition-all duration-200 ${colorClass} ${
          active ? 'animate-eq-3' : 'h-2'
        }`}
      />
    </div>
  );
});
