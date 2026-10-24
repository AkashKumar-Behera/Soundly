import { useApp } from '../store/app'

const BARS: [number, number, number][] = [
  [22, 42, 58],
  [36, 30, 70],
  [50, 22, 78],
  [64, 34, 66],
  [78, 43, 57],
]

export type LogoStyle = 'bars' | 'blend1' | 'blend2' | 'blend3'

interface Props {
  size?: number
  /** Draw the rounded tile behind the mark (the app icon). */
  tile?: boolean
  /** Force one design (used by the picker); by default the one chosen in Settings. */
  variant?: LogoStyle
}

/** Soundly's logo in the design picked in Settings. Several blended designs (Spotify green, Apple Music red and pink) to try. */
export function Logo({ size = 32, tile = true, variant }: Props) {
  const chosen = useApp((s) => s.logo)
  const style = variant ?? chosen
  const id = `lg-${style}`

  if (style === 'bars') {
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

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Soundly">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fa5c7c" />
          <stop offset="1" stopColor="#fc3c44" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1ed760" />
          <stop offset="1" stopColor="#0aa58a" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1ed760" />
          <stop offset="0.55" stopColor="#7a5cff" />
          <stop offset="1" stopColor="#fa4d6e" />
        </linearGradient>
      </defs>
      {style === 'blend1' && (
        <>
          {tile && <rect width="512" height="512" rx="116" fill={`url(#${id}-a)`} />}
          <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="26">
            <path d="M130 250 Q256 170 382 250" opacity="0.95" />
            <path d="M158 312 Q256 258 354 312" opacity="0.75" />
          </g>
          <circle cx="256" cy="370" r="30" fill="#1ed760" />
        </>
      )}
      {style === 'blend2' && (
        <>
          {tile && <rect width="512" height="512" rx="116" fill={`url(#${id}-b)`} />}
          <path d="M300 120 L300 320 A52 52 0 1 1 268 272 L268 168 L360 144 L360 120 Z" fill="#fff" />
          <g fill="none" stroke="#fa4d6e" strokeLinecap="round" strokeWidth="18">
            <path d="M150 330 Q150 250 200 210" />
            <path d="M118 360 Q118 230 190 170" />
          </g>
        </>
      )}
      {style === 'blend3' && (
        <>
          {tile && <rect width="512" height="512" rx="116" fill="#0d0d12" />}
          <circle cx="256" cy="256" r="170" fill={`url(#${id}-c)`} />
          <g fill="none" stroke="#0d0d12" strokeLinecap="round" strokeWidth="24">
            <path d="M160 234 Q256 180 352 234" />
            <path d="M178 286 Q256 244 334 286" />
          </g>
          <path d="M268 318 L268 360 A22 22 0 1 1 254 340 L254 318 Z" fill="#fff" />
        </>
      )}
    </svg>
  )
}
