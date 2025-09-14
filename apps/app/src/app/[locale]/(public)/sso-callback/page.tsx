import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export const metadata = {
  title: "Completing sign in...",
};

export default function SsoCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing your sign in...</p>
        <AuthenticateWithRedirectCallback />
      </div>
    </div>
  );
}
