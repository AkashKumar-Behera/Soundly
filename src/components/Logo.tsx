import { useApp } from '../store/app'

const BARS: [number, number, number][] = [
  [22, 42, 58],
  [36, 30, 70],
  [50, 22, 78],
  [64, 34, 66],
  [78, 43, 57],
]

export type LogoStyle = 'bars' | 'gold'

interface Props {
  size?: number
  /** Draw the rounded tile behind the mark (the app icon). */
  tile?: boolean
  /** Force one design (used by the picker); by default the one chosen in Settings. */
  variant?: LogoStyle
}

/** Soundly's logo: the original bars, or the green disc with a gold premium ring. The choice is made in Settings. */
export function Logo({ size = 32, tile = true, variant }: Props) {
  const chosen = useApp((s) => s.logo)
  const style: LogoStyle = variant ?? (chosen === 'gold' ? 'gold' : 'bars')

  if (style === 'gold') {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Soundly">
        <defs>
          <linearGradient id="logo-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1a8" />
            <stop offset="0.45" stopColor="#e6b800" />
            <stop offset="1" stopColor="#a87900" />
          </linearGradient>
        </defs>
        {tile && <rect width="512" height="512" rx="116" fill="#0b0f0c" />}
        <circle cx="256" cy="256" r="196" fill="none" stroke="url(#logo-gold)" strokeWidth="22" />
        <circle cx="256" cy="256" r="164" fill="#1ed760" />
        <g fill="none" stroke="#0b0f0c" strokeWidth="26" strokeLinecap="round">
          <path d="M158 222 Q256 170 354 222" />
          <path d="M176 280 Q256 240 336 280" />
          <path d="M196 336 Q256 308 316 336" />
        </g>
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Soundly">
      {tile && <rect width="100" height="100" rx="24" fill="#161618" />}
      <g stroke="#1ed760" strokeWidth="10" strokeLinecap="round">
        {BARS.map(([x, y1, y2]) => (
          <line key={x} x1={x} y1={y1} x2={x} y2={y2} />
        ))}
      </g>
    </svg>
  )
}
