"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  IconHouseFill, 
  IconDistributeHorizontalCenterFill,  
  IconGearshapeFill,
} from "symbols-react";
import { Button } from "@v1/ui/button";
import { SignOut } from "@/components/sign-out";
import { useAuth } from "@v1/convex/hooks";
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
    title: "Price Charts",
    href: "/charts",
    icon: IconDistributeHorizontalCenterFill,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: IconGearshapeFill,
  },
];

export function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Extract user data from Convex user object
  const email = user?.email || null;
  const name = user?.fullName || null;
  const avatarUrl = user?.avatarUrl || null;

  return (
    <div className="border-b bg-background">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image 
            src="/svela-logo.svg" 
            alt="Svela Logo" 
            width={32} 
            height={32} 
          />
        </div>

        {/* Navigation menu */}
        <nav className="flex items-center gap-1">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === item.href 
                  ? "bg-accent text-accent-foreground" 
                  : "hover:bg-accent/50"
              }`}
            >
              <item.icon className="size-4" />
              <span className="hidden sm:inline">{item.title}</span>
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-lg hover:ring-4 hover:ring-ring/20 transition-all duration-300">
              <Avatar className="h-8 w-8 rounded-lg">
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
          <DropdownMenuContent className="w-56" align="end" forceMount>
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
      </div>
    </div>
  );
}