"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="absolute top-0 w-full flex items-center justify-between p-4 z-10">
      <Link href="/" className="text-sm font-medium">
        Svela
      </Link>

      <nav className="md:mt-2">
        <ul className="flex items-center gap-4">
          <li>
            <Link
              href="/talk-to-us"
              className="text-sm px-4 py-2 bg-primary text-secondary rounded-full font-medium"
            >
              Talk to us
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
