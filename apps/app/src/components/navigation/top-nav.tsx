"use client";

//import Link from "next/link";
import Image from "next/image";
//`import { usePathname } from "next/navigation";
// import { 
//   IconHouseFill, 
//   IconDistributeHorizontalCenterFill,  
//   IconGearshapeFill,
// } from "symbols-react";
import { Button } from "@v1/ui/button";
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
import { SignOutButton, useClerk } from "@clerk/nextjs";
import { Fingerprint, LogOut } from "lucide-react";


// const menuItems = [
//   {
//     title: "Overview",
//     href: "/overview",
//     icon: IconHouseFill,
//   },
//   {
//     title: "Price Charts",
//     href: "/charts",
//     icon: IconDistributeHorizontalCenterFill,
//   },
//   {
//     title: "Settings",
//     href: "/settings",
//     icon: IconGearshapeFill,
//   },
// ];

function getGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function TopNav() {
  const { user } = useAuth();
  const { openUserProfile } = useClerk();

  const handleProfileClick = () => {
    openUserProfile();
  };

  const name = user?.fullName;
  const firstName = name?.split(' ')[0] || user?.email?.split('@')[0];
  const email = user?.email;
  const avatarUrl = user?.avatarUrl;

  return (
    <div className="py-12">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Logo and Greeting */}
        <div className="flex items-center gap-3">
          <Image 
            src="/svela-logo.svg" 
            alt="Svela Logo" 
            width={22} 
            height={22} 
            className="opacity-30"
          />
          <span className="text-lg font-bold text-white">
            {getGreeting()}, {firstName}
          </span>
        </div>

        {/* Navigation menu */}
        {/* <nav className="flex items-center gap-1">
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
        </nav> */}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User dropdown */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8">
                <Avatar className="h-8 w-8 rounded-md shadow-sm shadow-black/30 hover:ring-4 ring-1 ring-black/10 dark:ring-white/10 transition-all ease-in-out duration-150">
                  {avatarUrl && (
                    <AvatarImage 
                      src={avatarUrl} 
                      alt={name || email?.split('@')[0] || 'User'} 
                    />
                  )}
                  <AvatarFallback>
                    {email ? email.substring(0, 2).toUpperCase() : "UN"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-zinc-900 rounded-xl z-[101]" align="end" forceMount>
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
              <DropdownMenuItem onClick={handleProfileClick} className="cursor-pointer rounded-xl">
                <Fingerprint className="mr-2 h-4 w-4 text-primary/50" />
                Authentication
              </DropdownMenuItem>
              {/* <DropdownMenuItem>
                <IconGear className="mr-2 h-4 w-4 fill-primary/50" />
                Settings
              </DropdownMenuItem> */}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer w-full rounded-xl" asChild>
                <SignOutButton>
                  <button className="w-full text-left flex items-center">
                    <LogOut className="mr-2 h-4 w-4 text-primary/50" />
                    Sign out
                  </button>
                </SignOutButton>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}