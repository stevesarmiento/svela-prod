"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Card } from "@v1/ui/card";
import { Skeleton } from "@v1/ui/skeleton";
import { useAuth } from "@/lib/convex-hooks";
import { cn } from "@v1/ui/cn";
import { SvelaLogo } from "@v1/ui/svela-logo";
import {
  IconBinoculars,
  IconDistributeHorizontalCenter,
  IconSparkleMagnifyingglass,
} from "symbols-react";
import { formatWalletAddress, getUserDisplayName } from "@/lib/user-display";

type PatternId = "grid" | "waves" | "hatch" | "topo";

interface PatternOption {
  id: PatternId;
  label: string;
}

const PATTERN_OPTIONS: Array<PatternOption> = [
  { id: "grid", label: "Grid" },
  { id: "waves", label: "Waves" },
  { id: "hatch", label: "Hatch" },
  { id: "topo", label: "Topo" },
];

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toSafeDate(
  value: Date | number | string | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }
  return null;
}

const issuedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function formatIssuedDate(value: Date | null): string | null {
  if (!value) return null;
  return issuedDateFormatter.format(value);
}

function getInitials(fullName?: string, email?: string): string {
  const seed = (fullName?.trim() || email?.split("@")[0] || "").trim();
  const parts = seed.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join("")
      : seed.slice(0, 2).toUpperCase();
  return letters || "SV";
}

function getMemberId(seed: string): string {
  const hash = fnv1a32(seed);
  const serial = hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `SVL-${serial}`;
}

function getPatternForUser(userId: string): PatternId {
  const idx = fnv1a32(userId) % PATTERN_OPTIONS.length;
  return PATTERN_OPTIONS[idx]?.id ?? "grid";
}

function svgDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function PatternOverlay({ patternId }: { patternId: PatternId }) {
  const maskImage = "linear-gradient(to bottom, black, transparent 95%)";

  if (patternId === "waves") {
    const wavesWhite = svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 180 90" fill="none">
        <path d="M0 45 Q 15 22.5 30 45 T 60 45 T 90 45 T 120 45 T 150 45 T 180 45" stroke="white" stroke-opacity="0.9" stroke-width="2"/>
        <path d="M0 65 Q 15 42.5 30 65 T 60 65 T 90 65 T 120 65 T 150 65 T 180 65" stroke="white" stroke-opacity="0.5" stroke-width="2"/>
        <path d="M0 25 Q 15 2.5 30 25 T 60 25 T 90 25 T 120 25 T 150 25 T 180 25" stroke="white" stroke-opacity="0.5" stroke-width="2"/>
      </svg>
    `);

    const wavesShadow = svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 180 90" fill="none">
        <path d="M0 45 Q 15 22.5 30 45 T 60 45 T 90 45 T 120 45 T 150 45 T 180 45" stroke="black" stroke-opacity="0.65" stroke-width="2"/>
        <path d="M0 65 Q 15 42.5 30 65 T 60 65 T 90 65 T 120 65 T 150 65 T 180 65" stroke="black" stroke-opacity="0.35" stroke-width="2"/>
        <path d="M0 25 Q 15 2.5 30 25 T 60 25 T 90 25 T 120 25 T 150 25 T 180 25" stroke="black" stroke-opacity="0.35" stroke-width="2"/>
      </svg>
    `);

    return (
      <>
        <div
          className="absolute inset-0 scale-105 opacity-[0.1] blur-[0.5px]"
          style={{
            backgroundImage: wavesWhite,
            backgroundSize: "180px 90px",
            backgroundRepeat: "repeat",
            maskImage,
          }}
        />
        <div
          className="absolute inset-0 scale-105 opacity-[0.8] blur-[0.5px] translate-x-[-1px] translate-y-[-1px]"
          style={{
            backgroundImage: wavesShadow,
            backgroundSize: "180px 90px",
            backgroundRepeat: "repeat",
            maskImage,
          }}
        />
      </>
    );
  }

  if (patternId === "hatch") {
    return (
      <>
        <div
          className="absolute inset-0 scale-105 opacity-[0.1] blur-[0.5px]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 10px)",
            maskImage,
          }}
        />
        <div
          className="absolute inset-0 scale-105 opacity-[0.8] blur-[0.5px] translate-x-[-1px] translate-y-[-1px]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, rgba(0,0,0,0.75) 0 1px, transparent 1px 10px)",
            maskImage,
          }}
        />
      </>
    );
  }

  if (patternId === "topo") {
    // Keep topo on the left side only (single contour center) so the bevel lines up.
    const topoCenter = "circle at 20% 30%";
    const topoStep = "18px";

    return (
      <>
        <div
          className="absolute inset-0 scale-105 opacity-[0.1] blur-[0.5px]"
          style={{
            backgroundImage: `repeating-radial-gradient(${topoCenter}, rgba(255,255,255,0.75) 0 1px, transparent 1px ${topoStep})`,
            maskImage,
          }}
        />
        <div
          className="absolute inset-0 scale-105 opacity-[0.8] blur-[0.5px] translate-x-[-1px] translate-y-[-1px]"
          style={{
            backgroundImage: `repeating-radial-gradient(${topoCenter}, rgba(0,0,0,0.65) 0 1px, transparent 1px ${topoStep})`,
            maskImage,
          }}
        />
      </>
    );
  }

  // grid (default)
  return (
    <>
      <div
        className="absolute inset-0 scale-105 opacity-[0.1] blur-[0.5px]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage,
        }}
      />
      <div
        className="absolute inset-0 scale-105 opacity-[0.8] blur-[0.5px] translate-x-[-1px] translate-y-[-1px]"
        style={{
          backgroundImage:
            "linear-gradient(to right, black 1px, transparent 1px), linear-gradient(to bottom, black 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage,
        }}
      />
    </>
  );
}

function getPatternPreviewStyle(patternId: PatternId): CSSProperties {
  const common: CSSProperties = {
    backgroundColor: "#0b0b0f",
  };

  if (patternId === "waves") {
    const waves = svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60" fill="none">
        <path d="M0 30 Q 10 15 20 30 T 40 30 T 60 30 T 80 30 T 100 30 T 120 30" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
        <path d="M0 44 Q 10 29 20 44 T 40 44 T 60 44 T 80 44 T 100 44 T 120 44" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
      </svg>
    `);

    return {
      ...common,
      backgroundImage: waves,
      backgroundRepeat: "repeat",
      backgroundSize: "120px 60px",
    };
  }

  if (patternId === "hatch") {
    return {
      ...common,
      backgroundImage:
        "repeating-linear-gradient(-45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 9px)",
    };
  }

  if (patternId === "topo") {
    return {
      ...common,
      backgroundImage:
        "repeating-radial-gradient(circle at 20% 30%, rgba(255,255,255,0.20) 0 1px, transparent 1px 18px)",
    };
  }

  return {
    ...common,
    backgroundImage:
      "linear-gradient(to right, rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.22) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
  };
}

function PatternSelector({
  patternId,
  onSelect,
}: {
  patternId: PatternId;
  onSelect: (id: PatternId) => void;
}) {
  return (
    <div className="mt-2 w-fit">
      <div className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.2em]">
        Cover pattern
      </div>
      <div className="mt-2 flex items-center gap-4">
        {PATTERN_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            onClick={() => onSelect(option.id)}
            className={cn(
              "relative size-7 rounded-md overflow-hidden border shadow-sm",
              "transition-[transform,opacity,box-shadow] duration-200 ring-offset-background",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2",
              option.id === patternId
                ? "border-white/30 ring-2 ring-primary/20 ring-offset-2 opacity-100"
                : "border-white/20 opacity-75 hover:opacity-90 hover:ring-2 hover:ring-primary/10 hover:ring-offset-2",
            )}
            style={getPatternPreviewStyle(option.id)}
          >
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileCardSkeleton() {
  return (
    <div className="sticky top-6">
      <Card className="rounded-r-[2rem] rounded-l-[3px] border bg-zinc-50 dark:bg-zinc-950 overflow-hidden shadow-2xl h-[560px]">
        <div className="p-8 h-full flex flex-col justify-between">
          <div className="space-y-4">
            <Skeleton className="h-6 w-32 rounded-md" />
            <Skeleton className="h-4 w-48 rounded-md" />
            <div className="pt-8 grid grid-cols-6 gap-2">
              {Array.from({ length: 18 }, (_, i) => `skeleton-${i}`).map(
                (skeletonKey) => (
                  <Skeleton
                    key={skeletonKey}
                    className="aspect-square w-full rounded-sm opacity-20"
                  />
                ),
              )}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-12 w-64 rounded-xl" />
            <Skeleton className="h-4 w-40 rounded-md" />
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ProfileCard() {
  const { user, isLoading } = useAuth();
  const [patternSelection, setPatternSelection] = useState<{
    userId: string;
    patternId: PatternId;
  } | null>(null);

  if (isLoading) return <ProfileCardSkeleton />;

  if (!user) {
    return (
      <div className="sticky top-6">
        <Card className="rounded-r-[2rem] rounded-l-[3px] border bg-zinc-50 dark:bg-zinc-950 overflow-hidden shadow-2xl">
          <div className="p-8">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-2">
              Svela Journal
            </div>
            <div className="text-sm font-semibold text-balance text-zinc-900 dark:text-zinc-100">
              Please sign in to access your journal.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const displayName = getUserDisplayName({
    fullName: user.fullName,
    email: user.email,
    walletAddress: user.walletAddress,
    fallback: "Svela Member",
  });
  const initials = getInitials(
    user.fullName ?? undefined,
    user.email ?? user.walletAddress ?? undefined,
  );
  const walletLabel = formatWalletAddress(user.walletAddress);
  const memberId = getMemberId(user.id);
  const issuedAt = toSafeDate(user.createdAt ?? null);
  const issuedLabel = formatIssuedDate(issuedAt);
  const defaultPatternId = getPatternForUser(user.id);
  const patternId =
    patternSelection?.userId === user.id
      ? patternSelection.patternId
      : defaultPatternId;

  return (
    <div className="relative sticky top-6">
      {/* Skeuomorphic Bookmark */}
      <div className="absolute top-[-2px] left-16 z-20 pointer-events-none select-none">
        <div
          className={cn("relative h-38 w-9 origin-top")}
          style={{
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 92%, 0 100%)",
          }}
        >
          {/* Base ribbon */}
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500 to-rose-700 shadow-[0_14px_24px_rgba(0,0,0,0.35)]" />

          {/* Edge shading */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/35 opacity-60" />

          {/* Inner emboss */}
          <div className="absolute inset-[2px] bg-gradient-to-b from-rose-400/80 to-rose-800/80 opacity-90" />

          {/* Top stitch/highlight */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-white/35" />
          <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white/20 to-transparent opacity-40" />

          {/* Fabric-ish micro texture (no external assets) */}
          <div
            className="absolute inset-0 opacity-25 mix-blend-overlay"
            style={{
              backgroundImage: `
                  repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 5px),
                  repeating-linear-gradient(-45deg, rgba(0,0,0,0.10) 0, rgba(0,0,0,0.10) 1px, transparent 1px, transparent 6px)
                `,
              backgroundSize: "auto",
            }}
          />
          {/* Stitching (left + right) */}
          <div
            className="absolute top-2 bottom-4 left-[1.5px] w-[1px] opacity-90"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(32, 0, 0, 0.55) 0 3px, transparent 6px 10px)",
            }}
          />
          <div
            className="absolute top-2 bottom-4 right-[1.5px] w-[1px] opacity-90"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(32, 0, 0, 0.55) 0 3px, transparent 6px 10px)",
            }}
          />
        </div>
      </div>
      <div className="relative">
        <Card
          className={cn(
            "relative rounded-r-[2rem] rounded-l-[3px] border-0 overflow-hidden shadow-2xl h-[580px]",
            "bg-zinc-900 border border-zinc-800 ring-1 ring-black",
          )}
        >
          {/* Oversized Svela mark (background) */}
          <div className="absolute top-[20px] right-[-144px] z-0 opacity-20 pointer-events-none select-none">
            <SvelaLogo
              width={360}
              height={340}
              adaptive={false}
              fillColor="black"
            />
          </div>

          {/* Notebook Spine (Skeuomorphic) */}
          {/* Blurred highlight to sell the spine depth */}
          <div className="absolute inset-y-0 left-0 w-24 bg-white/[0.05] blur-2xl opacity-60 z-10" />
          <div className="absolute inset-y-0 left-0 w-[35px] bg-white/[0.02] z-20 rounded-l-[3px]" />
          <div className="absolute inset-y-0 left-[33px] w-[3px] bg-black/40 z-20 blur-[1px]" />
          <div className="absolute inset-y-0 left-[34px] w-[1px] bg-white/20 z-20 blur-[3px]" />
          <div className="absolute inset-y-0 left-[4px] w-[1px] bg-white/20 z-20 blur-[3px]" />

          {/* Journal Texture & Grid */}
          <div className="absolute inset-0 z-10">
            {/* Subtle noise texture (no external assets) */}
            <div
              className="absolute inset-0 opacity-[0.10] mix-blend-soft-light"
              style={{
                backgroundImage: `
                radial-gradient(circle at 18% 22%, rgba(255,255,255,0.35) 1px, transparent 1px),
                radial-gradient(circle at 82% 62%, rgba(255,255,255,0.25) 1px, transparent 1px),
                radial-gradient(circle at 44% 86%, rgba(255,255,255,0.18) 1px, transparent 1px)
              `,
                backgroundSize: "64px 64px, 96px 96px, 128px 128px",
              }}
            />

            <PatternOverlay patternId={patternId} />
          </div>

          {/* Content Layer */}
          <div className="relative z-30 p-10 pl-16 h-full flex flex-col justify-between">
            {/* Header Info */}
            <div className="space-y-6" />

            {/* User Name (Bottom - Image 2 style) */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconBinoculars className="size-6 fill-white/30" />
                  <IconDistributeHorizontalCenter className="size-6 fill-white/30" />
                  <IconSparkleMagnifyingglass className="size-6 fill-white/30" />
                </div>
                <h2 className="text-5xl font-bold font-berkeley-mono tracking-tight text-white leading-none">
                  {displayName}
                </h2>
              </div>

              {/* Technical Labels (Printed style) */}
              <div className="flex items-end justify-between border-t border-white/10 pt-6">
                <div className="space-y-1">
                  <div className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">
                    Member ID
                  </div>
                  <div className="text-xs font-berkeley-mono text-white/80 tabular-nums">
                    {memberId}
                  </div>
                </div>
                <div className="flex items-end gap-8">
                  {walletLabel ? (
                    <div className="space-y-1 text-right">
                      <div className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">
                        Wallet
                      </div>
                      <div className="text-xs font-berkeley-mono text-white/80 tabular-nums">
                        {walletLabel}
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-1 text-right">
                    <div className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">
                      Issued
                    </div>
                    <div className="text-xs font-berkeley-mono text-white/80 tabular-nums">
                      {issuedLabel ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Subtle bottom shadow to enhance skeuomorphism */}
        <div className="absolute -bottom-2 inset-x-10 h-8 bg-black/20 blur-sm rounded-full -z-10" />
      </div>

      <PatternSelector
        patternId={patternId}
        onSelect={(nextId) =>
          setPatternSelection({ userId: user.id, patternId: nextId })
        }
      />
    </div>
  );
}
