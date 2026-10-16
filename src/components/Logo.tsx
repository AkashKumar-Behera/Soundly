const BARS: [number, number, number][] = [
  [22, 42, 58],
  [36, 30, 70],
  [50, 22, 78],
  [64, 34, 66],
  [78, 43, 57],
]

interface Props {
  size?: number
  /** Draw the dark rounded tile behind the bars (the app icon). */
  tile?: boolean
}

export function Logo({ size = 32, tile = true }: Props) {
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
