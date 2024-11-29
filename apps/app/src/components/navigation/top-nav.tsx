"use client";

import { Button } from "@v1/ui/button";
import {
  IconMegaphoneFill,
  IconMagnifyingglass,
} from "symbols-react";
import { Input } from "@v1/ui/input";
import { SidebarTrigger, useSidebar } from "@v1/ui/sidebar";

export function TopNav() {
  const { open } = useSidebar();

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Menu button */}
        {!open && (
          <SidebarTrigger>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative h-8 w-8 rounded-md hover:bg-foreground/10"
            >
              <span className="sr-only">Open sidebar</span>
            </Button>
          </SidebarTrigger>
        )}

        {/* Search */}
        <div className="flex-1 flex items-center">
          <div className="relative w-full max-w-md">
            <IconMagnifyingglass className="absolute left-2 top-2.5 h-4 w-4 fill-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-8 w-full"
            />
          </div>
        </div>

        {/* Right side items */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <IconMegaphoneFill className="h-5 w-5 fill-muted-foreground" />
            <span className="absolute top-0 right-0 h-2 w-2 bg-destructive rounded-full" />
          </Button>
        </div>
      </div>
    </div>
  );
}