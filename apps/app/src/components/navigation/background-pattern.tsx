import React from 'react';

interface BackgroundPatternProps {
  className?: string;
}

/**
 * Shared background pattern component used across navigation elements
 * React 19: Optimized component to eliminate code duplication
 */
export const BackgroundPattern = React.memo(({ className = "" }: BackgroundPatternProps) => {
  return (
    <>
      {/* Dark dots pattern */}
      <div className={`absolute inset-0 opacity-5 dark:opacity-5 z-0 ${className}`}
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, oklch(0 0 0) 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, oklch(0 0 0) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />
      {/* Light dots pattern (only visible in light mode) */}
      <div className={`absolute inset-0 opacity-5 dark:opacity-0 z-0 ${className}`}
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, oklch(1 0 0) 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, oklch(1 0 0) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />
    </>
  );
});

BackgroundPattern.displayName = 'BackgroundPattern';
