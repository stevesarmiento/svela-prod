"use client";

import { useAuth } from "@v1/convex/hooks";
import { Button } from "@v1/ui/button";

export function GoogleSignin() {
  const { signIn } = useAuth();

  const handleSignin = () => {
    signIn();
  };

  return (
    <Button onClick={handleSignin} variant="outline" className="font-mono">
      Sign in with Google
    </Button>
  );
}
