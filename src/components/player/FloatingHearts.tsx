import { memo } from 'react';

export interface HeartBubble {
  id: number;
  x: number;
  y: number;
  rotate: number;
}

interface FloatingHeartsProps {
  hearts: HeartBubble[];
}

export const FloatingHearts = memo(function FloatingHearts({
  hearts,
}: FloatingHeartsProps) {
  if (hearts.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {hearts.map((h) => (
        <div
          key={h.id}
          className="absolute animate-heart-rise pointer-events-none"
          style={
            {
              left: `${h.x}px`,
              top: `${h.y}px`,
              '--heart-rot': `${h.rotate}deg`,
            } as React.CSSProperties
          }
        >
          <svg
            className="w-14 h-14 text-[#fe2c55] drop-shadow-[0_4px_12px_rgba(254,44,85,0.45)]"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      ))}
    </div>
  );
});
