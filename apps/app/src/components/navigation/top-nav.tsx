"use client";

import { Button } from "@v1/ui/button";
import { Bell, Search } from "lucide-react";
import { Input } from "@v1/ui/input";

export function TopNav() {

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Search */}
        <div className="flex-1 flex items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
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
            <Bell className="h-5 w-5" />
            <span className="absolute top-0 right-0 h-2 w-2 bg-destructive rounded-full" />
          </Button>
        </div>
      </div>
    </div>
  );
}