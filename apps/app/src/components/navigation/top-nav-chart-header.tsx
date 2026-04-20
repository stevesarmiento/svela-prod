"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@v1/ui/button";
import { IconChevronBackward } from "symbols-react";
import { useTokenHeader } from "@/hooks/use-token-header";

export function TopNavChartHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [todayLabel, setTodayLabel] = useState<string | null>(null);
  const { isChartDetailPage, tokenData, isLoading } = useTokenHeader();

  const coinId = isChartDetailPage ? tokenData?.id ?? null : null;
  const watchlistGroup = searchParams.get("wg");
  const backToWatchlistComparisonUrl = watchlistGroup
    ? `/watchlists?wt=chart&wg=${watchlistGroup}`
    : "/watchlists?wt=chart";

  const handleBack = useCallback(() => {
    let didPop = false;

    const onPopState = () => {
      didPop = true;
    };

    window.addEventListener("popstate", onPopState, { once: true });
    router.back();

    window.setTimeout(() => {
      if (didPop) return;
      window.removeEventListener("popstate", onPopState);
      router.push(backToWatchlistComparisonUrl);
    }, 200);
  }, [backToWatchlistComparisonUrl, router]);

  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  const imageSrc = useMemo(() => {
    if (!tokenData?.logoUrl) return "/favicon.ico";
    return tokenData.logoUrl.startsWith("http") || tokenData.logoUrl.startsWith("/")
      ? tokenData.logoUrl
      : "/favicon.ico";
  }, [tokenData?.logoUrl]);

  return (
    <div className="flex items-center gap-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="cursor-pointer rounded-xl size-8"
        aria-label="Go back"
      >
        <IconChevronBackward className="h-3 w-3 fill-current" />
      </Button>
      <div className="flex items-center gap-2">
        {tokenData && !isLoading ? (
          <Image
            src={imageSrc}
            alt={tokenData.name}
            className="w-8 h-8 rounded-full ring-1 ring-gray-200 dark:ring-white/10"
            width={32}
            height={32}
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.src = "/favicon.ico";
            }}
            priority
            placeholder="blur"
            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-white/10 animate-pulse motion-reduce:animate-none" />
        )}
        <div className="flex flex-col gap-0">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isLoading ? (
              <div className="h-4 w-16 bg-gray-200 dark:bg-white/10 rounded animate-pulse motion-reduce:animate-none" />
            ) : (
              tokenData?.symbol || coinId || "Token Details"
            )}
          </h1>
          <p className="text-xs text-gray-900 dark:text-white">
            <span className="text-xs text-gray-500 dark:text-white/60">
              Today is{" "}
            </span>
            {todayLabel ?? "Today"}
          </p>
        </div>
      </div>
    </div>
  );
}
