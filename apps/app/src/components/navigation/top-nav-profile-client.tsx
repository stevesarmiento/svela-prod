"use client";

import { useClerk, useUser, SignOutButton } from "@clerk/nextjs";
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
import { Fingerprint, LogOut } from "lucide-react";
import { formatWalletAddress, getUserDisplayName } from "@/lib/user-display";

interface TopNavProfileClientProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopNavProfileClient(props: TopNavProfileClientProps) {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();

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
          <Avatar className="h-8 w-8 rounded-md shadow-sm shadow-black/30 hover:ring-4 ring-1 ring-black/10 dark:ring-white/10 transition-all ease-in-out duration-150">
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
        className="w-56 bg-white dark:bg-zinc-900 rounded-xl z-[101]"
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
        <DropdownMenuItem
          onClick={() => openUserProfile()}
          className="cursor-pointer rounded-xl"
        >
          <Fingerprint className="mr-2 h-4 w-4 text-primary/50" />
          Authentication
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer w-full rounded-xl" asChild>
          <SignOutButton>
            <button type="button" className="w-full text-left flex items-center">
              <LogOut className="mr-2 h-4 w-4 text-primary/50" />
              Sign out
            </button>
          </SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
