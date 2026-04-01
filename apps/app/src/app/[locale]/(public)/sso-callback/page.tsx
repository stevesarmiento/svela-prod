import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return createMetadata({
    title: "Completing sign in…",
    pathname: "/sso-callback",
    locale,
    robots: { index: false, follow: false },
  });
}

export default function SsoCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Completing your sign in...</p>
        {/* Required DOM element for Clerk CAPTCHA widget */}
        <div id="clerk-captcha" />
        <AuthenticateWithRedirectCallback />
      </div>
    </div>
  );
}
