import { LoginMethods } from "@/components/login-methods";
import { createMetadata } from "@/lib/metadata";
import { Card, CardContent, CardDescription, CardHeader } from "@v1/ui/card";
import { SvelaLogo } from "@v1/ui/svela-logo";
import type { Metadata } from "next";
import { ProductPreview } from "../../../../../../web/src/components/product-preview";
import {
  getShowcaseScreenerRows,
  getShowcaseWatchlists,
} from "../../../../../../web/src/lib/showcase-watchlists";
import { AuthCardDashes } from "./_components/auth-card-dashes";
import "./product-preview.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return createMetadata({
    title: "Login",
    pathname: "/login",
    locale,
    robots: { index: false, follow: false },
  });
}

export default async function Page() {
  const [watchlists, screenerRows] = await Promise.all([
    getShowcaseWatchlists(),
    getShowcaseScreenerRows(),
  ]);

  return (
    <main className="grid min-h-dvh w-full overflow-hidden bg-background lg:grid-cols-[minmax(500px,0.9fr)_minmax(0,1.1fr)]">
      <section className="relative flex min-h-dvh items-center justify-center overflow-hidden border-border/70 px-5 py-10 lg:border-r lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35 dark:opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 75% 68% at 50% 50%, black 10%, transparent 72%)",
          }}
        />

        <div className="relative w-full max-w-[460px]">
          <div className="group relative w-full rounded-xl p-4">
            <AuthCardDashes />

            <Card className="relative overflow-hidden border-none p-4">
              <CardHeader className="relative z-10 space-y-3">
                <div className="flex items-center gap-3">
                  <SvelaLogo
                    adaptive={true}
                    className="opacity-70"
                    height={36}
                    width={36}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h1 className="text-balance text-2xl font-bold tracking-wide text-foreground">
                        aggr<span className="text-primary/50">.</span>watch
                      </h1>
                      <p className="text-sm italic text-foreground/80">(v.)</p>
                      <p className="font-mono text-sm text-muted-foreground">
                        /ˈaɡər ˌwɑtʃ/
                      </p>
                    </div>
                  </div>
                </div>

                <CardDescription className="text-pretty text-sm leading-6 text-muted-foreground">
                  <span className="text-foreground">
                    Aggressively watching markets until the moment clarity shows
                    up and you&apos;re ready to act.
                  </span>
                </CardDescription>
              </CardHeader>

              <CardContent className="relative z-10 space-y-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>
                    Track tokens and wallets you care about in one place, across
                    timeframes, with less noise.
                  </li>
                  <li>
                    Build a watchlist you&apos;ll actually use, then turn
                    signals into decisions with insights.
                  </li>
                </ol>

                <div className="pt-1">
                  <div className="mt-3 w-full">
                    <LoginMethods />
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Connect an account to keep your watchlists, charts, and
                    insights synced.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section
        aria-label="Product preview"
        className="relative hidden min-h-dvh overflow-hidden bg-[#0d0d0f] text-white lg:block"
        style={{
          backgroundImage:
            'linear-gradient(oklch(0.1297 0.005 285.67 / 0.26), oklch(0.1297 0.005 285.67 / 0.38)), linear-gradient(oklch(1 0 0 / 0.027) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.027) 1px, transparent 1px), radial-gradient(circle at 74% 32%, oklch(0.4249 0.1358 287.74 / 0.16), transparent 27rem), radial-gradient(circle at 15% 90%, oklch(0.5008 0.1035 56.65 / 0.1), transparent 26rem), url("https://uksgfm3uq5.ufs.sh/f/cflVQmqOSasDH3WhWklGuwJKRyhcQ7TrLvbWPaOqoBSdgH06")',
          backgroundPosition: "center",
          backgroundRepeat:
            "no-repeat, repeat, repeat, no-repeat, no-repeat, no-repeat",
          backgroundSize: "auto, 42px 42px, 42px 42px, auto, auto, cover",
        }}
      >
        <div className="absolute inset-y-0 left-12 flex w-[calc(200%_-_20rem)] items-center">
          <div className="w-full shrink-0">
            <ProductPreview
              screenerRows={screenerRows}
              watchlists={watchlists}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
