import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { ChartTooltip, type ChartTooltipProps } from './chart-tooltip';

export interface TooltipManager {
    getElement: () => HTMLDivElement;
    show: (props: ChartTooltipProps) => void;
    hide: () => void;
    setPosition: (left: number, top: number) => void;
    getSize: () => { width: number; height: number };
    destroy: () => void;
}

export function createTooltipManager(): TooltipManager {
    const tooltipEl = document.createElement('div');
    const tooltipRoot: Root = createRoot(tooltipEl);

    tooltipEl.className =
        'fixed hidden overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none z-50 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50';

    document.body.appendChild(tooltipEl);

    function show(props: ChartTooltipProps) {
        tooltipEl.style.display = 'block';
        tooltipRoot.render(React.createElement(ChartTooltip, props));
    }

    function hide() {
        tooltipEl.style.display = 'none';
    }

    function setPosition(left: number, top: number) {
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }

    function getSize() {
        return { width: tooltipEl.offsetWidth, height: tooltipEl.offsetHeight };
    }

    function destroy() {
        const el = tooltipEl;
        const root = tooltipRoot;

        // Defer root unmount to next microtask to avoid
        // "synchronously unmount a root while React was already rendering" error
        queueMicrotask(() => {
            try {
                root.unmount();
            } catch {
                // Ignore unmount errors
            }
            if (el.parentNode) {
                document.body.removeChild(el);
            }
        });
    }

    return { getElement: () => tooltipEl, show, hide, setPosition, getSize, destroy };
}
