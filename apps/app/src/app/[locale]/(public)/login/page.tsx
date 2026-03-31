import { GoogleSignin } from "@/components/google-signin";
import { SvelaLogo } from "@v1/ui/svela-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@v1/ui/card";
import { AuthCardDashes } from "./_components/auth-card-dashes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
};

export default function Page() {
  return (
    <main className="min-h-dvh w-full bg-background px-6 py-12 overflow-hidden">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center">
        <div className="group relative w-full rounded-xl p-4">
          <AuthCardDashes />

          <Card className="relative overflow-hidden rounded-2xl bg-card shadow-sm">
            {/* Texture layers (behind content) */}
            <div
              className="pointer-events-none absolute inset-0 z-0 size-full opacity-40 dark:opacity-30"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='rgba(255,250,250,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-full w-full bg-gradient-to-t from-zing via-zinc-900 to-zinc-900 dark:from-primary-950/0 dark:via-primary-950 dark:to-primary-950" />

            <CardHeader className="relative z-10 space-y-3">
              <div className="flex items-center gap-3">
                <SvelaLogo
                  width={36}
                  height={36}
                  adaptive={true}
                  className="opacity-70"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h1 className="text-balance text-2xl font-bold tracking-wide text-foreground">
                      aggr<span className="text-primary/50">.</span>watch
                    </h1>
                    <p className="text-sm italic text-foreground/80">(v.)</p>
                    <p className="text-sm font-mono text-muted-foreground">
                      /ˈaɡər ˌwɑtʃ/
                    </p>
                  </div>
                </div>
              </div>

              <CardDescription className="text-pretty text-sm leading-6 text-muted-foreground">
                <span className="text-foreground">
                  Aggressively watching markets until the moment clarity shows up and you&apos;re ready to act.
                 </span>{" "}
              </CardDescription>
            </CardHeader>

            <CardContent className="relative z-10 space-y-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  Track tokens and wallets you care about in one place, across timeframes, with
                  less noise.
                </li>
                <li>
                  Build a watchlist you'll actually use, then turn signals into
                  decisions with insights.
                </li>
              </ol>

              <div className="pt-1">
                <div className="mt-3 w-full ">
                  <GoogleSignin />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  connect an account and keep your watchlists, <br /> charts, and insights synced.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
