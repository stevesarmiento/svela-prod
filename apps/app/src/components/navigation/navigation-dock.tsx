import React from 'react';
import { NavigationItems } from './navigation-items';
import { SelectionContent } from './selection-content';
import type { CommandContext, SelectionState } from './bottom-nav-context';
import { cn } from '@v1/ui/cn';

interface NavigationDockProps {
  mode: 'navigation' | 'selection';
  selectionState: SelectionState | null;
  onOpenCommandSearch?: (context: CommandContext | null) => void;
}

const layerTransitionClass =
  'transition-opacity duration-[var(--motion-nav-duration)] ease-[var(--motion-nav-ease-out)] motion-reduce:transition-none';

const NavigationDockComponent = ({
  mode,
  selectionState,
  onOpenCommandSearch,
}: NavigationDockProps) => {
  const dockClassName = React.useMemo(() => {
    return `relative rounded-[20px] overflow-hidden p-1 h-[56px] w-auto
           shadow-[0_3px_8px_oklch(0_0_0_/_0.1),0_2px_4px_oklch(0_0_0_/_0.06)]
           dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]
           grid grid-cols-1 grid-rows-1 place-items-center
           ${mode === 'selection'
             ? 'bg-rose-950 border border-red-200 dark:border-red-800/50'
             : 'bg-white/95 border border-gray-200/50 dark:bg-zinc-800/80 backdrop-blur-md dark:border-transparent'
           }`;
  }, [mode]);

  return (
    <div className={dockClassName}>
      <div
        className={cn(
          'col-start-1 row-start-1 w-auto',
          layerTransitionClass,
          mode === 'navigation'
            ? 'relative z-10 opacity-100'
            : 'pointer-events-none relative z-0 opacity-0',
        )}
        aria-hidden={mode !== 'navigation'}
      >
        <div className="flex w-auto items-center gap-1 p-1">
          <NavigationItems onOpenCommandSearch={onOpenCommandSearch || (() => {})} />
        </div>
      </div>

      {selectionState ? (
        <div
          className={cn(
            'col-start-1 row-start-1 flex w-[320px] items-center justify-center',
            layerTransitionClass,
            mode === 'selection'
              ? 'relative z-10 opacity-100'
              : 'pointer-events-none relative z-0 opacity-0',
          )}
          aria-hidden={mode !== 'selection'}
        >
          <SelectionContent selectionState={selectionState} />
        </div>
      ) : null}
    </div>
  );
};

export const NavigationDock = React.memo(NavigationDockComponent, areNavigationDockPropsEqual);

NavigationDock.displayName = 'NavigationDock';

function areNavigationDockPropsEqual(
  prevProps: NavigationDockProps,
  nextProps: NavigationDockProps,
): boolean {
  return (
    prevProps.mode === nextProps.mode &&
    prevProps.selectionState?.selectedCoins === nextProps.selectionState?.selectedCoins &&
    prevProps.selectionState?.totalCoins === nextProps.selectionState?.totalCoins &&
    prevProps.selectionState?.isRemoving === nextProps.selectionState?.isRemoving
  );
}
