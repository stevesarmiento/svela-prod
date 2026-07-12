import { ProductPreview } from "@/components/product-preview";
import { SectionLine } from "@/components/section-line";
import {
  getShowcaseScreenerRows,
  getShowcaseWatchlists,
} from "@/lib/showcase-watchlists";
import { SvelaLogo } from "@v1/ui/svela-logo";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const desktopDockApps = [
  {
    name: "Finder",
    icon: "https://uksgfm3uq5.ufs.sh/f/cflVQmqOSasD3vTvre1pMdN7v5ZBJcg2jIxs6VKnGukWSDib",
  },
  {
    name: "Arc",
    icon: "https://uksgfm3uq5.ufs.sh/f/cflVQmqOSasD49pz7egs1InePY4butkiEdq2aSXxv8Kl6rDV",
  },
  { name: "aggr.watch", icon: null },
  {
    name: "Terminal",
    icon: "https://uksgfm3uq5.ufs.sh/f/cflVQmqOSasDlQzCJOFX0JKgWe9GFqC5RoE6UjHv8c4YAiDz",
  },
] as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DesktopDock() {
  return (
    <div className="desktop-dock" aria-label="aggr.watch desktop app dock">
      {desktopDockApps.map((app) => (
        <div className="desktop-dock-item" key={app.name}>
          {app.name === "aggr.watch" ? (
            <span className="desktop-dock-tooltip">aggr.watch</span>
          ) : null}
          <div
            className={`desktop-dock-icon ${app.name === "aggr.watch" ? "desktop-dock-icon-svela" : ""}`}
            title={app.name}
          >
            {app.icon ? (
              <img src={app.icon} alt={app.name} width="64" height="64" />
            ) : (
              <SvelaLogo
                width={31}
                height={31}
                adaptive={false}
                fillColor="oklch(1 0 0 / 0.92)"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Page() {
  const [watchlistCards, screenerRows] = await Promise.all([
    getShowcaseWatchlists(),
    getShowcaseScreenerRows(),
  ]);
  const details = [
    ["01", "Watchlists", "Organize assets around the ideas you care about."],
    [
      "02",
      "Smart screener",
      "Describe a setup and turn it into usable filters.",
    ],
    [
      "03",
      "Market context",
      "Compare price action across groups and timeframes.",
    ],
    [
      "04",
      "Portfolio",
      "See wallet holdings and allocation alongside the market.",
    ],
    ["05", "Live data", "Keep current prices and movement within reach."],
    [
      "06",
      "Keyboard first",
      "Move through the product without losing your flow.",
    ],
  ];

  return (
    <main>
      <div className="page-rail">
        <section className="hero">
          <SectionLine />
          <div className="eyebrow">
            <span /> Crypto market intelligence
          </div>
          <h1>Clarity, before the moment passes.</h1>
          <p className="hero-lede">
            Build focused watchlists, screen the market, and turn noisy price
            action into a view you can actually use.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={appUrl}>
              Open aggr.watch <ArrowIcon />
            </a>
            <a className="button button-secondary" href="#product">
              See what’s inside
            </a>
          </div>
          <p className="hero-note">
            <span>✦</span> Your watchlists, charts, and insights—synced.
          </p>
        </section>

        <section className="product-stage" aria-label="Product preview">
          <SectionLine />
          <ProductPreview
            screenerRows={screenerRows}
            watchlists={watchlistCards}
          />
        </section>

        <section className="bento-section" id="product">
          <SectionLine />
          <div className="bento-grid">
            <div className="bento-column bento-column-left">
              <div className="bento-row bento-row-small">
                <article className="bento-card bento-card-half">
                  <div className="bento-copy">
                    <h3>Focused watchlists</h3>
                    <p>Group the assets and narratives you actually follow.</p>
                  </div>
                  <div className="mini-watchlist" aria-hidden="true">
                    <span className="mini-card mini-card-yellow" />
                    <span className="mini-card mini-card-blue" />
                    <span className="mini-card mini-card-rose" />
                  </div>
                </article>

                <article className="bento-card bento-card-half">
                  <div className="bento-copy">
                    <h3>Live market pulse</h3>
                    <p>See movement as it develops across timeframes.</p>
                  </div>
                  <div className="pulse-visual" aria-hidden="true">
                    <span className="pulse-line pulse-line-one" />
                    <span className="pulse-line pulse-line-two" />
                    <i />
                  </div>
                </article>
              </div>

              <article className="bento-card bento-card-large screener-bento">
                <div className="bento-copy">
                  <h3>Screen in plain English</h3>
                  <p>
                    Turn an idea into market filters without the spreadsheet
                    work.
                  </p>
                </div>
                <div className="screener-panel" aria-hidden="true">
                  <div className="screener-query">
                    <span>✦</span> Find liquid assets gaining momentum
                  </div>
                  <div className="screener-row">
                    <i className="coin coin-orange" />
                    <span>Bitcoin</span>
                    <b>+3.24%</b>
                  </div>
                  <div className="screener-row">
                    <i className="coin coin-purple" />
                    <span>Solana</span>
                    <b>+6.08%</b>
                  </div>
                  <div className="screener-row">
                    <i className="coin coin-blue" />
                    <span>Ethereum</span>
                    <b>+2.71%</b>
                  </div>
                </div>
              </article>
            </div>

            <div className="bento-column">
              <article className="bento-card bento-card-large context-bento">
                <div className="bento-copy">
                  <h3>Keep the market in context</h3>
                  <p>
                    Compare movement and understand what’s happening around your
                    positions.
                  </p>
                </div>
                <div className="context-chart" aria-hidden="true">
                  <div className="context-label">
                    <span>Market pulse</span>
                    <b>24H</b>
                  </div>
                  <svg viewBox="0 0 300 92" preserveAspectRatio="none">
                    <defs>
                      <linearGradient
                        id="context-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0"
                          stopColor="oklch(0.709 0.1592 293.54)"
                          stopOpacity=".24"
                        />
                        <stop offset="1" stopColor="oklch(0.709 0.1592 293.54)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      className="context-fill"
                      d="M0 80 C22 71 34 75 51 61 C69 45 82 63 100 48 C119 32 130 51 151 38 C174 22 190 36 208 20 C232 0 251 22 270 12 C282 6 292 9 300 3 L300 92 L0 92 Z"
                    />
                    <path
                      className="context-line"
                      d="M0 80 C22 71 34 75 51 61 C69 45 82 63 100 48 C119 32 130 51 151 38 C174 22 190 36 208 20 C232 0 251 22 270 12 C282 6 292 9 300 3"
                    />
                  </svg>
                </div>
              </article>

              <div className="bento-row bento-row-small">
                <article className="bento-card bento-card-half">
                  <div className="bento-copy">
                    <h3>Portfolio overview</h3>
                    <p>Holdings, wallets, and performance in one place.</p>
                  </div>
                  <div className="allocation-visual" aria-hidden="true">
                    <span className="allocation-a" />
                    <span className="allocation-b" />
                    <span className="allocation-c" />
                  </div>
                </article>

                <article className="bento-card bento-card-half">
                  <div className="bento-copy">
                    <h3>Built for speed</h3>
                    <p>Keyboard-first navigation keeps the signal close.</p>
                  </div>
                  <div className="shortcut-visual" aria-hidden="true">
                    <kbd>⌘</kbd>
                    <span>+</span>
                    <kbd>K</kbd>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section
          className="desktop-showcase"
          aria-label="aggr.watch desktop application"
        >
          <SectionLine />
          <div className="desktop-showcase-inner">
            <ProductPreview
              initialView="overview"
              screenerRows={screenerRows}
              watchlists={watchlistCards}
            />
            <DesktopDock />
          </div>
        </section>

        <section className="details-section">
          <SectionLine />
          <div className="details-heading">
            <span>Everything you need</span>
            <h2>One focused market workspace.</h2>
            <p>
              Watchlists, screening, portfolio context, and comparative charts
              work together instead of becoming another stack of tabs.
            </p>
          </div>
          <div className="details-grid">
            {details.map(([number, title, description]) => (
              <article className="detail-item" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="closing">
          <SectionLine />
          <div className="closing-mark">
            <SvelaLogo
              width={28}
              height={28}
              adaptive={false}
              fillColor="oklch(1 0 0 / 0.85)"
            />
          </div>
          <h2>
            Watch aggressively.
            <br />
            Act with clarity.
          </h2>
          <a className="button button-primary" href={appUrl}>
            Open aggr.watch <ArrowIcon />
          </a>
        </section>
      </div>
    </main>
  );
}
