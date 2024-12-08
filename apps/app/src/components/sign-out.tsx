"use client";

import { createClient } from "@v1/supabase/client";
import { Button } from "@v1/ui/button";

export function SignOut() {
  const supabase = createClient();

  const handleSignOut = () => {
    supabase.auth.signOut();
    window.location.href = '/login';
    window.location.reload();
  };

  return (
    <Button
      onClick={handleSignOut}
      variant="outline"
      className="font-mono gap-2 flex items-center"
    >
      {/* <Icons.SignOut className="size-4" /> */}
      <span>Sign out</span>
    </Button>
  );
}
