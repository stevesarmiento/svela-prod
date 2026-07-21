# Article Analysis: "Reverse Engineering ChatGPT Web: How OpenAI Built for a Billion Users"

**Author:** Dennis Brotzky · July 2, 2026
**Analyzed:** July 20, 2026

---

## Overall Assessment

A strong piece of technical investigation. The core strengths are real: original primary-source research (page source, bundles, network requests, Wayback Machine), a clear thesis ("understand the constraints and every decision follows"), concrete numbers instead of hand-waving, and a genuinely insightful framing of ChatGPT as "the most mainstream stack with every default questioned." The Next.js → Remix → React Router history is well assembled and the ChatGPT vs. Claude comparison is a satisfying close.

The issues are fixable: a broken cross-reference caused by section ordering, several internal number inconsistencies, a handful of typos/grammar slips, missing methodology framing, and some repetitive throat-clearing that dilutes otherwise sharp writing.

**Verdict: 8/10 — publishable-quality research that a solid editing pass would take to 9+.**

---

## 1. Structural Problems (highest priority)

### 1.1 Broken forward reference — "Letting a billion strangers in"

The section says:

> "We actually saw the front of this in the last section: the chat-requirements prepare and finalize handshake the app fires before you send anything."

But the `chat-requirements` prepare/finalize handshake is first described in the **following** section ("The fastest path to the first token"), not the previous one. Readers hit a reference to something they haven't read yet.

**Fix (pick one):**
- Swap the order of "Letting a billion strangers in" and "The fastest path to the first token" so the handshake is introduced before it's referenced, **or**
- Reword to a forward reference: "We'll see the front of this in the next section…"

### 1.2 The closing summary duplicates the article

"How ChatGPT web is built" restates nearly every section in prose. It works as a recap, but a **table or bulleted decision-log** (Constraint → Decision → Evidence) would be more scannable and less repetitive. This is also the natural place for a shareable "TL;DR" graphic.

### 1.3 Table of contents has no anchors

The "What I'll dig into" list should link to section anchors. Also, its items don't all match the final section titles exactly — align them.

### 1.4 "A small aside on data fetching" is buried

It sits inside "Don't reinvent the wheel with components" but is about TanStack Query, not components. Either promote it to its own short section or fold it into the SSR/hydration discussion where `__REACT_QUERY_CACHE__` is more at home.

### 1.5 Missing methodology note

The disclaimer ("I don't work at OpenAI…") is good, but the piece would benefit from a short **"How I measured this"** box up front: browser/devtools setup, network conditions, geography (Vancouver is mentioned only in passing), dates of capture, and a caveat that flag counts / chunk counts / payload sizes are point-in-time snapshots that will drift.

---

## 2. Internal Inconsistencies

| # | Claim A | Claim B | Fix |
|---|---------|---------|-----|
| 1 | "pulls **over a hundred** JavaScript chunks" (Can you type yet?) | "**160 content-hashed chunks**" (summary) | Use one number, or say "~160 (over a hundred)" consistently |
| 2 | Stack list says "**Tailwind CSS**" (no version) | Summary says "**Tailwind v4**" | Put the version in the stack list where readers expect it |
| 3 | Document is "**84 KB compressed**" | Bootstrap script is "**377 KB of JSON**" inlined "in the served HTML" | Clarify compressed vs. uncompressed — as written, a 377 KB inline script inside an 84 KB document reads as a contradiction |
| 4 | "The migration was caught in the wild, not announced by **ChatGPT**" | — | Should be "not announced by **OpenAI**" (ChatGPT is the product, not the announcer) |
| 5 | "556 feature gates, 144 dynamic configs, 192 experiment layers" | Code sample shows `dynamic_configs: {}` and `layer_configs: {}` empty | Add a note that the sample is truncated, or show one entry per object |

---

## 3. Typos & Grammar

| Location | Current | Fix |
|----------|---------|-----|
| Migration section | `tweeted "New Remix app just dropped: chatgpt.com."Wes Bos dug` | Missing space after the closing quote |
| Components section | "the color palette. very simple, and the shapes aren't complex" | "…dropdowns open instantly, the color palette is very simple, and the shapes aren't complex" |
| Fastest path to paint | "it's a great approach for this **usecase**" | "use case" |
| Closing | "a free class in shipping **a wonderful React to the anyone** on the internet" | "…shipping a wonderful React app to anyone on the internet" |
| Can you type yet? | "the network is the enemy, and every new origin is another **source**." | Incomplete thought — "another source of latency" (or "another handshake") |
| Fastest path to paint | "which **signals back to** the original constraints we talked about" | "which ties back to…" |
| Components section | "If you want to build an app that is used by everyone you have to keep the UI as simple as possible" | Add comma after "everyone" |

---

## 4. Claims Needing Citations or Hedging

1. **"roughly 1 billion people"** — the article's headline number. Link a source (OpenAI announcement, earnings coverage, etc.) on first use.
2. **"OpenAI has started offsetting with ads"** — a significant claim dropped in a parenthetical. Cite it or cut it.
3. **"OpenAI bought Statsig for 1.1 billion dollars"** — accurate, but link the announcement; also, the acquisition was announced September 2025, so "And then in September 2025…" reads fine — just add the link.
4. **"ChatGPT conversations are mostly short"** — stated as the rationale for no virtualization, but it's the author's inference. The hedge "I'm also sure they have plenty of data" is doing heavy lifting; make explicit this is speculation, or strengthen it (e.g., test a very long conversation and report what happens to scroll performance).
5. **"Researchers who decrypted Cloudflare's challenge"** — link the research.
6. **Tibor Blaho / Ryan Florence / Wes Bos / Tanner Linsley references** — each should be hyperlinked to the actual tweet/video/podcast episode.
7. **"claude.ai is a client side rendered single page app served straight off a CDN"** — verify this is still true at publish time and note when it was checked; competitor stacks change.

---

## 5. Repetition & Tightening

- The word **"constraints"** and the "it all comes back to the constraints" move appears in at least five sections. It's the thesis — twice at the start and once at the end is enough; the middle repetitions ("Again, thinking back to the constraints…", "This goes back to the original understanding of the constraints…", "which signals back to the original constraints…") can be cut without loss.
- **"a billion users/people/strangers"** appears in the title, several headers, and body copy repeatedly. Keep it in the title and the security section; vary elsewhere.
- The **"best network request is the one you never make"**-style aphorisms are good, but there are several per section ("the network is the enemy", "You can't improve what you don't measure!", "the fastest font is the one already installed"). Ration them — one landing punchline per section hits harder.
- "Fastest path to paint" and "The fastest path to the first token" are near-duplicate headers; consider renaming one (e.g., "First paint" / "First token") to sharpen the parallel instead of blurring it.

---

## 6. Content Opportunities (additions that would elevate the piece)

1. **A boot-sequence timeline diagram** — TTFB → shell paint → theme script → hydration → composer TTFI → prefetch → first token. The article describes this sequence beautifully in prose; a single visual would make it the most-shared asset in the post.
2. **A three-way comparison table** — ChatGPT vs. Claude vs. Linear across rendering strategy, auth model, offline support, styling, flags. The article already draws all three comparisons; collecting them pays off the author's series.
3. **Internationalization** — the route manifest shows `($lang)` prefixes, but i18n is never discussed. How does a billion-user app handle locale detection, RTL, translated shells? Even a paragraph noting it's server-driven would round out the "built for everyone" thesis.
4. **Accessibility beyond MathML** — the MathML detail is excellent; a quick audit (landmarks, focus management during streaming, reduced-motion handling) would extend it and fits the "app for everyone" framing.
5. **Define jargon on first use** — TTFI, SSE, hydration, proof-of-work, RUM. The piece straddles expert and general web-dev audiences; one-clause definitions keep the second group aboard.
6. **The 377 KB flag payload deserves scrutiny, not just admiration** — the article celebrates every byte saved elsewhere, then describes a 377 KB inline JSON blob neutrally. Interrogate the tradeoff: what does that cost on a slow connection, and why is it still net-positive vs. a flag-service round trip? That analysis is exactly this article's brand.
7. **What they *didn't* find** — a short "open questions" list (how the backend renders SSR at this scale? edge vs. origin split? deploy cadence?) signals rigor and invites follow-up.

---

## 7. What's Working (keep these)

- **Primary-source receipts everywhere**: the `_buildManifest.js` from Wayback, `__reactRouterContext`, the flag names like `deferStartupImportsUntilComposerTTFI`. Named artifacts make the piece feel unimpeachable.
- **The constraint-first framing** — it turns a teardown into an architecture lesson.
- **The Sentinel/security section** — "hide the bouncer" is the strongest writing in the piece and covers ground no other teardown does.
- **Honest counterintuitive findings** — no virtualization, no service worker, no webfont — with reasoned explanations for each absence.
- **The closing line** ("you can read each company's strategy straight out of their network tab") — earned and quotable.

---

## Prioritized Edit Checklist

- [ ] **P0** Fix the "last section" forward reference (reorder or reword) — §1.1
- [ ] **P0** Reconcile chunk count (100+ vs 160) and document-size vs 377 KB payload — §2
- [ ] **P0** Fix the four typo/grammar errors in §3
- [ ] **P1** Add methodology/date-of-capture note — §1.5
- [ ] **P1** Cite the 1B users, ads, and Statsig-acquisition claims — §4
- [ ] **P1** Cut redundant "constraints" callbacks (keep ~3) — §5
- [ ] **P2** Convert closing summary into a decision table; add TOC anchors — §1.2, §1.3
- [ ] **P2** Add boot-timeline diagram and 3-way comparison table — §6
- [ ] **P3** Add i18n and accessibility paragraphs; interrogate the flag-payload tradeoff — §6
