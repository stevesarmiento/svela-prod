import Link from "next/link";
import { SectionLine } from "@/components/section-line";
import { SvelaLogo } from "@v1/ui/svela-logo";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function Footer() {
  return (
    <footer className="site-footer">
      <SectionLine />
      <div className="page-rail footer-inner">
        <div className="footer-brand-block">
          <span>Developed by</span>
          <div className="footer-brand-name">
            <SvelaLogo
              width={25}
              height={25}
              adaptive={false}
              fillColor="rgba(255,255,255,.74)"
            />
            <strong>aggr.watch</strong>
          </div>
          <p>Focused crypto market intelligence for clearer decisions.</p>
          <small>
            © {new Date().getFullYear()} Svela. All rights reserved.
          </small>
        </div>

        <div className="footer-nav-grid">
          <div>
            <h4>Product</h4>
            <a href={`${appUrl}/watchlists`}>Watchlists</a>
            <a href={`${appUrl}/screener`}>Screener</a>
            <a href={`${appUrl}/overview`}>Portfolio</a>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/talk-to-us">Talk to us</Link>
            <a href={appUrl}>Open app</a>
          </div>
          <div>
            <h4>Built for</h4>
            <span>Crypto markets</span>
            <span>Onchain assets</span>
            <span>Clearer decisions</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
