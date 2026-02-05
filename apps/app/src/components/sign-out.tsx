"use client";

import { useAuth } from "@/lib/convex-hooks";
import { Button } from "@v1/ui/button";

export function SignOut() {
  const { signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
  };

  return (
    <Button
      onClick={handleSignOut}
      variant="outline"
      className="font-diatype-mono gap-2 flex items-center"
    >
      {/* <Icons.SignOut className="size-4" /> */}
      <span>Sign out</span>
    </Button>
  );
}
