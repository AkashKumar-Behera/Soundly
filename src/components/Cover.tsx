import type { CSSProperties } from 'react'

interface Props {
  hue: number
  hue2?: number
  size?: number
  round?: boolean
  className?: string
  /** Real cover art; the generated gradient stays underneath until it loads. */
  thumbUrl?: string
}

/** Generated cover art: a hue-seeded gradient with a faint equalizer motif. */
export function Cover({ hue, hue2 = hue + 50, size, round, className = '', thumbUrl }: Props) {
  const style: CSSProperties = {
    background: `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 85% 62%) 0%, transparent 60%), linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${hue2} 75% 26%))`,
    ...(size ? { width: size, height: size } : null),
    ...(round ? { borderRadius: '50%' } : null),
  }
  return (
    <div className={`cover ${className}`} style={style} aria-hidden="true">
      {thumbUrl ? (
        <img src={thumbUrl} alt="" loading="lazy" className="cover-img" />
      ) : null}
      <svg viewBox="0 0 100 100" className="cover-bars" style={thumbUrl ? { display: 'none' } : undefined}>
        <g stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity="0.28">
          <line x1="26" y1="42" x2="26" y2="58" />
          <line x1="38" y1="32" x2="38" y2="68" />
          <line x1="50" y1="24" x2="50" y2="76" />
          <line x1="62" y1="34" x2="62" y2="66" />
          <line x1="74" y1="43" x2="74" y2="57" />
        </g>
      </svg>
    </div>
  )
}
