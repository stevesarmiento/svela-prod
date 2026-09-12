"use client";

import { MENU_ITEMS } from "@/components/navigation/bottom-nav-constants";
import { CommandSearchPillShell } from "@/components/navigation/command-search-pill-shell";
import { CommandSearchTrigger } from "@/components/navigation/command-search-trigger";
import { DockShell } from "@/components/navigation/navigation-dock";
import { NavigationItemButton } from "@/components/navigation/navigation-item-button";
import { TopNavAvatarButton, getRouteGreeting } from "@/components/navigation/top-nav";
import { TopNavShell } from "@/components/navigation/top-nav-shell";
import { getShortcutForRoute } from "@/lib/keyboard-shortcuts";
import {
  bottomNavChromeMotionStyle,
  uiEnterExitTransition,
} from "@/lib/motion-tokens";
import { SvelaLogo } from "@v1/ui/svela-logo";
import { TooltipProvider } from "@v1/ui/tooltip";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { LoginShowcaseData } from "../_lib/showcase-types";
import { PreviewOverviewView } from "./preview-overview-view";
import { PreviewScreenerView } from "./preview-screener-view";
import { PreviewWatchlistsView } from "./preview-watchlists-view";

type PreviewView = "watchlists" | "screener" | "overview";

const VIEW_CYCLE: ReadonlyArray<PreviewView> = [
  "watchlists",
  "screener",
  "overview",
];
const VIEW_ROTATION_MS = 7000;
const PREVIEW_USER_NAME = "Steven Sarmiento";

/** Dock tab → preview view. "Compare" has no preview pane (stays inert). */
const VIEW_BY_HREF: Partial<Record<string, PreviewView>> = {
  "/overview": "overview",
  "/watchlists": "watchlists",
  "/screener": "screener",
};

/** Same titles `TopNav` derives from the route. */
const STATIC_TITLES: Record<Exclude<PreviewView, "overview">, string> = {
  watchlists: "Watch",
  screener: "Token Screener",
};

const viewEnterExit = {
  initial: { opacity: 0, filter: "blur(4px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

function noop() {}

/**
 * The login page's product preview: the REAL dashboard shell (top nav, page
 * content, dock) rendered from the app's own components over static showcase
 * data. Cycles watchlists → screener → overview; hover pauses; dock switches.
 */
export function LoginProductPreview({ data }: { data: LoginShowcaseData }) {
  const [view, setView] = useState<PreviewView>("watchlists");
  const [rotationEpoch, setRotationEpoch] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  // Client-only bits: canvas charts + time-of-day greeting (hydration-safe,
  // same pattern as TopNav).
  useEffect(() => {
    setMounted(true);
    setGreeting(getRouteGreeting());
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const timer = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setView((current) => {
        const nextIndex = (VIEW_CYCLE.indexOf(current) + 1) % VIEW_CYCLE.length;
        return VIEW_CYCLE[nextIndex] ?? "watchlists";
      });
    }, VIEW_ROTATION_MS);

    return () => window.clearInterval(timer);
    // rotationEpoch restarts the interval after a manual dock selection.
  }, [shouldReduceMotion, rotationEpoch]);

  const selectView = (next: PreviewView) => {
    setView(next);
    setRotationEpoch((epoch) => epoch + 1);
  };

  const firstName = PREVIEW_USER_NAME.split(" ")[0] ?? PREVIEW_USER_NAME;
  const title =
    view === "overview"
      ? `${greeting ?? "Good morning"}, ${firstName}`
      : STATIC_TITLES[view];

  return (
    <TooltipProvider>
      <div
        aria-label="A preview of the aggr.watch interface cycling through the watchlists, screener, and overview views"
        className="dark relative h-[calc(100dvh-6rem)] max-h-[900px] w-full overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950 text-white shadow-2xl font-diatype"
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
        // Sample UI: swallow every link/row click so nothing navigates away
        // from the login page (next/link bails when defaultPrevented).
        onClickCapture={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-preview-dock='true']")) return;
          event.preventDefault();
        }}
      >
        <div className="flex h-full flex-col max-w-[1440px] mx-auto">
          <TopNavShell
            leftSlot={
              <>
                <span className="opacity-50">
                  <SvelaLogo width={25} height={25} adaptive={true} />
                </span>
                <span className="text-xl font-diatype-bold text-zinc-950 dark:text-white">
                  {title}
                </span>
              </>
            }
            rightSlot={<TopNavAvatarButton displayName={PREVIEW_USER_NAME} />}
          />

          <main className="flex min-h-0 w-full flex-grow pb-20">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={view}
                className="w-full"
                initial={shouldReduceMotion ? false : viewEnterExit.initial}
                animate={viewEnterExit.animate}
                exit={shouldReduceMotion ? undefined : viewEnterExit.exit}
                transition={uiEnterExitTransition(shouldReduceMotion)}
              >
                {view === "watchlists" ? (
                  <PreviewWatchlistsView
                    watchlists={data.watchlists}
                    chartsReady={mounted}
                  />
                ) : null}
                {view === "screener" ? (
                  <PreviewScreenerView
                    coins={data.screenerCoins}
                    trailById={data.screenerTrailById}
                    generatedAtMs={data.generatedAtMs}
                  />
                ) : null}
                {view === "overview" ? (
                  <PreviewOverviewView
                    overview={data.overview}
                    generatedAtMs={data.generatedAtMs}
                  />
                ) : null}
              </m.div>
            </AnimatePresence>
          </main>
        </div>

        <PreviewDock view={view} onSelect={selectView} />
      </div>
    </TooltipProvider>
  );
}

/** `BottomNav` chrome: dock + search pill, positioned inside the frame. */
function PreviewDock({
  view,
  onSelect,
}: {
  view: PreviewView;
  onSelect: (view: PreviewView) => void;
}) {
  return (
    <nav
      aria-label="Preview navigation"
      className="dark pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center px-4"
      data-preview-dock="true"
    >
      <div
        className="pointer-events-auto relative flex max-w-full shrink-0 flex-nowrap items-center gap-2"
        style={bottomNavChromeMotionStyle()}
      >
        <DockShell mode="navigation">
          <div className="flex items-center gap-2">
            {MENU_ITEMS.map((item) => {
              const itemView = VIEW_BY_HREF[item.href];
              const isActive = itemView !== undefined && itemView === view;
              return (
                <NavigationItemButton
                  key={item.href}
                  icon={item.icon}
                  label={item.title}
                  tooltipLabel={item.title}
                  shortcut={getShortcutForRoute(item.href)}
                  isActive={isActive}
                  isExactActive={isActive}
                  onClick={() => {
                    if (itemView) onSelect(itemView);
                  }}
                />
              );
            })}
          </div>
        </DockShell>

        <CommandSearchPillShell>
          <div className="flex items-center">
            <CommandSearchTrigger onOpen={noop} />
          </div>
        </CommandSearchPillShell>
      </div>
    </nav>
  );
}
