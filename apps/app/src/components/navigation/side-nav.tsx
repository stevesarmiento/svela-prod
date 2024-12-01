"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  IconHouseFill, 
  IconDistributeHorizontalCenterFill,  
  IconGearshapeFill,
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
import { createClient } from "@v1/supabase/client";
import { useEffect, useState } from "react";
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

export function SideNav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setName(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null);
      setAvatarUrl(user?.user_metadata?.avatar_url ?? null);
    }
    getUser();
  }, [supabase.auth]);

  return (
      <Sidebar className="flex flex-col items-center bg-foreground/5">
        <SidebarHeader className="flex justify-center items-center p-4">
          <Image 
            src="/svela-logo.svg" 
            alt="Svela Logo" 
            width={50} 
            height={50} 
          />
        </SidebarHeader>
        <SidebarContent className="flex flex-col justify-center items-center">
          <SidebarMenu className="space-y-2 flex flex-col justify-center items-center">
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <SidebarMenuItem 
                  key={item.href} 
                  className="relative h-8 w-8 hover:bg-foreground/10"
                >
                  <Link href={item.href} className="flex items-center justify-center h-full w-full">
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <item.icon className="h-4 w-4 fill-foreground" />
                    </SidebarMenuButton>
                  </Link>
                  {isActive && (
                    <div className="absolute left-[48.5px] top-1/2 transform -translate-y-1/2 w-[3px] h-6 bg-primary" />
                  )}
                </SidebarMenuItem>
              );
            })}
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