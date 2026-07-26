"use client";

import { useUser, SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import { Button } from "@v1/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v1/ui/dropdown-menu";
import { formatWalletAddress, getUserDisplayName } from "@/lib/user-display";

/** Door-with-arrow sign-out glyph (viewBox 24×24, stroke-based). */
function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M11 12H19M15.5 8.5L19 12L15.5 15.5"
        stroke="currentColor"
        strokeWidth="1.82"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 5H7.25C6.00736 5 5 6.00736 5 7.25V16.75C5 17.9926 6.00736 19 7.25 19H9.5"
        stroke="currentColor"
        strokeWidth="1.82"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Hex-nut settings glyph (viewBox 24×24, stroke-based). */
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21.0192 12.7156C21.2438 12.286 21.2438 11.7764 21.0192 11.3469C20.5727 10.4933 19.7923 9.0186 19.1875 7.96875C18.5559 6.8725 17.6276 5.39184 17.0978 4.55619C16.8407 4.15055 16.4048 3.89607 15.9251 3.87241C14.9509 3.82437 13.2422 3.75 11.9999 3.75C10.7578 3.75 9.04906 3.82437 8.07489 3.87241C7.59519 3.89606 7.15918 4.15055 6.90207 4.55619C6.3724 5.39184 5.44401 6.8725 4.81246 7.96875C4.20767 9.0186 3.42721 10.4933 2.98075 11.3469C2.75609 11.7764 2.75609 12.286 2.98075 12.7156C3.42721 13.5692 4.20767 15.0439 4.81246 16.0937C5.44401 17.19 6.3724 18.6706 6.90207 19.5063C7.15918 19.912 7.59519 20.1664 8.07489 20.1901C9.04906 20.2381 10.7578 20.3125 11.9999 20.3125C13.2422 20.3125 14.9509 20.2381 15.9251 20.1901C16.4048 20.1664 16.8407 19.912 17.0978 19.5063C17.6276 18.6706 18.5559 17.19 19.1875 16.0937C19.7923 15.0439 20.5727 13.5692 21.0192 12.7156ZM12.0005 15.1562C13.7264 15.1562 15.1255 13.7572 15.1255 12.0313C15.1255 10.3054 13.7264 8.90625 12.0005 8.90625C10.2746 8.90625 8.87544 10.3054 8.87544 12.0313C8.87544 13.7572 10.2746 15.1562 12.0005 15.1562Z"
        stroke="currentColor"
        strokeWidth="1.82"
      />
    </svg>
  );
}

interface TopNavProfileClientProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopNavProfileClient(props: TopNavProfileClientProps) {
  const { user, isLoaded } = useUser();

  const displayName = getUserDisplayName({
    fullName: user?.fullName ?? undefined,
    email: user?.primaryEmailAddress?.emailAddress ?? undefined,
    walletAddress: user?.primaryWeb3Wallet?.web3Wallet ?? undefined,
    fallback: "User",
  });
  const email = user?.primaryEmailAddress?.emailAddress;
  const walletLabel = formatWalletAddress(user?.primaryWeb3Wallet?.web3Wallet);
  const avatarUrl = user?.imageUrl;

  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8">
          <Avatar className="h-8 w-8 rounded-md shadow-sm shadow-black/30 hover:ring-4 ring-1 ring-black/10 dark:ring-white/10 transition-shadow duration-[var(--duration-micro)]">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} loading="lazy" />
            ) : null}
            <AvatarFallback>
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 bg-white dark:bg-zinc-900 rounded-2xl z-[101]"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {isLoaded ? displayName : "User"}
            </p>
            {email ? (
              <p className="text-xs leading-none text-muted-foreground">
                {email}
              </p>
            ) : walletLabel ? (
              <p className="text-xs leading-none text-muted-foreground">
                {walletLabel}
              </p>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-[13px]">
          <Link href="/settings" className="flex items-center">
            <SettingsIcon className="mr-2 h-4 w-4 text-primary/50" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer w-full rounded-[13px]" asChild>
          <SignOutButton>
            <button
              type="button"
              className="w-full text-left flex items-center"
            >
              <SignOutIcon className="mr-2 h-4 w-4 text-primary/50" />
              Sign out
            </button>
          </SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
