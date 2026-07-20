import { LANSWEEPER_LOGO_DATA_URI } from './lansweeperLogo';

/**
 * App logo (Lansweeper Headless Demo). The official Lansweeper mark is embedded as a
 * self-contained data URI (no external CDN), so it renders reliably on any background.
 */
export function Logo({ height = 56 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 620 120"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      role="img"
      aria-label="Lansweeper Headless Demo"
      style={{ display: 'block', width: 'auto' }}
    >
      {/* Official Lansweeper logo (grey full logo), embedded */}
      <image x="24" y="40" width="300" height="40" preserveAspectRatio="xMinYMid meet" xlinkHref={LANSWEEPER_LOGO_DATA_URI} />

      {/* Divider */}
      <rect x="352" y="34" width="2" height="52" rx="1" fill="#C9CCD6" />

      {/* Suffix — designed for a dark background (the Lansweeper mark is white). */}
      <g fontFamily="'Segoe UI', Helvetica, Arial, sans-serif">
        <text x="378" y="58" fontSize="26" fontWeight="700" fill="#FFFFFF">
          Headless
        </text>
        <g transform="translate(378,70)">
          <rect x="0" y="0" width="92" height="24" rx="12" fill="#EDE7FF" />
          <text x="46" y="16" fontSize="13" fontWeight="600" fill="#5B34E6" letterSpacing="2.5" textAnchor="middle">
            DEMO
          </text>
        </g>
      </g>
    </svg>
  );
}
