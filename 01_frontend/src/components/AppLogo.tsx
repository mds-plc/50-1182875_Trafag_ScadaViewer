/**
 * @file AppLogo.tsx
 * @description Sdílené SVG logo aplikace — 4 čtverce ve 2×2 mřížce (šedé tóny).
 *   Vzor převzat z operator-view projektu. Používán v Sidebar i LoginOverlay.
 */

interface Props {
  size?: number
}

/** Sdílené logo aplikace — 4 čtverce (vzor z operator-view). */
export default function AppLogo({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2"  y="2"  width="11" height="11" rx="2" fill="#6B7280" />
      <rect x="15" y="2"  width="11" height="11" rx="2" fill="#9CA3AF" />
      <rect x="2"  y="15" width="11" height="11" rx="2" fill="#9CA3AF" />
      <rect x="15" y="15" width="11" height="11" rx="2" fill="#4B5563" />
    </svg>
  )
}
