/**
 * Custom stroke-based watchlist glyphs (design SVGs, tinted via currentColor).
 */

interface IconProps {
  className?: string
}

/** Rounded-card watchlists glyph (viewBox 24×24). */
export function WatchlistsIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M3.61125 6.813C3.1905 7.59975 3.1455 8.448 3.05625 10.143C3.02175 10.7933 3 11.43 3 12C3.00278 12.6191 3.02154 13.2381 3.05625 13.8563C3.1455 15.5528 3.1905 16.4003 3.61125 17.1863C3.95475 17.829 4.59825 18.4748 5.2395 18.8197C6.0247 19.2427 6.89915 19.2915 8.64719 19.389L8.6475 19.389C9.80475 19.4535 10.9875 19.5 12 19.5C13.0125 19.5 14.1952 19.4535 15.3525 19.3898C17.1007 19.2923 17.9753 19.2428 18.7605 18.8197C19.4018 18.474 20.0452 17.829 20.3888 17.187C20.8095 16.4003 20.8545 15.552 20.9437 13.857C20.9782 13.2067 21 12.57 21 12C21 11.4293 20.9782 10.7932 20.9437 10.1437C20.8545 8.44725 20.8095 7.59975 20.3888 6.81375C20.0452 6.171 19.4018 5.52525 18.7605 5.18025C17.9753 4.75727 17.1008 4.70851 15.3528 4.61102L15.3525 4.611C14.1952 4.5465 13.0125 4.5 12 4.5C10.8817 4.50699 9.76382 4.54375 8.6475 4.61025C6.89925 4.70775 6.02475 4.75725 5.2395 5.18025C4.59825 5.526 3.95475 6.171 3.61125 6.813Z"
        stroke="currentColor"
        strokeWidth="1.875"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.00024 10.0005H12"
        stroke="currentColor"
        strokeWidth="1.875"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Rounded-card with plus badge — create watchlist glyph (viewBox 33×33). */
export function CreateWatchlistIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 33 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M16.5 6.1875C14.9624 6.19711 13.4253 6.24766 11.8903 6.33909C9.48647 6.47316 8.28403 6.54122 7.20431 7.12284C6.32259 7.59825 5.43778 8.48512 4.96547 9.36787C4.38694 10.4497 4.32506 11.616 4.20234 13.9466C4.15491 14.8407 4.125 15.7163 4.125 16.5C4.12883 17.3513 4.15462 18.2024 4.20234 19.0523C4.32506 21.385 4.38694 22.5503 4.96547 23.6311C5.43778 24.5149 6.32259 25.4028 7.20431 25.8772C8.28403 26.4588 9.48647 26.5258 11.8903 26.6599C13.4815 26.7486 15.1078 26.8125 16.5 26.8125C17.8922 26.8125 19.5185 26.7486 21.1097 26.6609C23.5135 26.5268 24.716 26.4588 25.7957 25.8772C26.6774 25.4017 27.5622 24.5149 28.0345 23.6321C28.6131 22.5503 28.6749 21.384 28.7977 19.0534C28.8451 18.1593 28.875 17.2837 28.875 16.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 10.125H29"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M24.25 5L24.25 15"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Bookmark with plus badge — add token glyph (viewBox 32×32). */
export function AddTokenIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M24.25 18C24.25 20.7893 24.1684 23.2211 24.0984 25.8654C24.064 27.1667 22.5023 27.7979 21.5678 26.8917L17.0442 22.5056C16.4623 21.9414 15.5377 21.9414 14.9558 22.5056L10.4322 26.8917C9.49766 27.7979 7.93598 27.1667 7.90155 25.8654C7.83159 23.2211 7.75 19.5392 7.75 16.7499C7.75 13.7315 7.84555 9.66779 7.9185 7.00482C7.96121 5.44619 9.19624 4.18877 10.7543 4.12782C12.3758 4.06438 13.4132 4 15 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M16 9H26"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M21 4L21 14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Wallet with flap and coin dot — import from wallet glyph (viewBox 32×32). */
export function WalletIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M7.28125 7.25H23.6875C23.722 7.25 23.75 7.27797 23.75 7.3125C23.75 7.34703 23.722 7.375 23.6875 7.375H7.9375C6.52227 7.375 5.375 8.52227 5.375 9.9375C5.375 11.3528 6.52229 12.5 7.9375 12.5H25C26.1218 12.5 27.0312 13.4095 27.0312 14.5312V23.7188C27.0312 24.8405 26.1218 25.75 25 25.75H7.28125C6.15942 25.75 5.25 24.8405 5.25 23.7188V9.28125C5.25 8.15943 6.15943 7.25 7.28125 7.25Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M24.2812 18.6407C24.2812 19.5468 23.5467 20.2813 22.6406 20.2813C21.7345 20.2813 21 19.5468 21 18.6407C21 17.7346 21.7345 17 22.6406 17C23.5467 17 24.2812 17.7346 24.2812 18.6407Z"
        fill="currentColor"
      />
    </svg>
  )
}
