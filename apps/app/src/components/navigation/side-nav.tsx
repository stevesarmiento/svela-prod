"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWatchlistPreservingNavigation } from "@/lib/navigation-utils";
import { 
  IconHouseFill, 
  IconSafariFill,  
} from "symbols-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@v1/ui/sidebar";
import { Button } from "@v1/ui/button";
import { SignOut } from "@/components/sign-out";
import { useAuth } from "@/lib/convex-hooks";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v1/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";

const menuItems = [
  {
    title: "Overview",
    href: "/overview",
    icon: IconHouseFill,
  },
  {
    title: "Screener",
    href: "/screener",
    icon: IconSafariFill,
  },
];

export function SideNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const navigation = useWatchlistPreservingNavigation();

  // Get correct URL for menu items with watchlist preservation
  const getMenuItemUrl = (href: string) => {
    switch (href) {
      case "/screener":
        return navigation.screener;
      case "/overview":
        return navigation.overview;
      default:
        return href;
    }
  };

  // Extract user data from Convex user object
  const email = user?.email || null;
  const name = user?.fullName || null;
  const avatarUrl = user?.avatarUrl || null;

  return (
      <Sidebar className="flex flex-col items-center bg-black/60">
        <SidebarHeader className="flex justify-center items-center p-4">
          <Image 
            src="/svela-logo.svg" 
            alt="Svela Logo" 
            width={50} 
            height={50} 
          />
        </SidebarHeader>

        <SidebarContent className="flex-1 flex flex-col justify-center items-center p-4">
          <SidebarMenu className="flex flex-col gap-4">
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={`h-12 w-12 flex items-center justify-center rounded-lg ${
                    pathname === item.href 
                      ? "bg-white/10 text-white" 
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Link href={getMenuItemUrl(item.href)}>
                    <item.icon className="size-6" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="flex flex-col justify-center items-center p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8">
                <Avatar className="h-8 w-8 rounded-md shadow-lg shadow-black/30 ring-1 ring-black/80">
                  <AvatarImage 
                    src={avatarUrl || ''} 
                    alt={name || email?.split('@')[0] || 'User'} 
                  />
                  <AvatarFallback>
                    {email ? email.substring(0, 2).toUpperCase() : "UN"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-background" align="start" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {name || email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <SignOut />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
  );
}