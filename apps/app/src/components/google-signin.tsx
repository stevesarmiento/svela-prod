"use client";

import { useAuth } from "@v1/convex/hooks";
import { Button } from "@v1/ui/button";
import { IconGoogleLogo } from "symbols-react";

export function GoogleSignin() {
  const { signIn } = useAuth();

  const handleSignin = () => {
    signIn('google');
  };

  return (
    <Button onClick={handleSignin} variant="outline" className="text-sm" startIcon={<IconGoogleLogo className="size-4 fill-white/40" />}>
      Sign in with Google
    </Button>
  );
}
