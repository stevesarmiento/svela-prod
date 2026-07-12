import { SvelaLogo } from "@v1/ui/svela-logo";
import Link from "next/link";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function Header() {
  return (
    <header className="site-header">
      <div className="page-rail header-inner">
        <Link href="/" className="site-brand" aria-label="Svela home">
          <SvelaLogo
            width={21}
            height={21}
            adaptive={false}
            fillColor="currentColor"
          />
          <span>
            aggr<span className="brand-dot">.</span>watch
          </span>
          <small>by Svela</small>
        </Link>

        <nav aria-label="Main navigation">
          <Link href="#product" className="nav-link">
            Product
          </Link>
          <Link href="/talk-to-us" className="nav-link nav-link-muted">
            Talk to us
          </Link>
          <a href={appUrl} className="header-cta">
            Open app <span>↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
