const paper = "#FCF9F4"
const cream = "#F3E9DC"
const beige = "#E1CDBB"
const cocoa = "#745244"
const espresso = "#38231E"

function upperLashes(originY: number, lengths: number[]) {
  return lengths.map((length, index) => {
    const x = 48 + index * 28
    const lean = (index - lengths.length / 2) * 6
    return `M${x} ${originY} C ${x + lean * 0.3} ${originY - length * 0.45}, ${x + lean} ${originY - length * 0.75}, ${x + lean * 1.15} ${originY - length}`
  })
}

export function StudyArt({ id }: { id: string }) {
  if (id === "lash-fan") return <LashFan />
  if (id === "lash-line") return <LashLine />
  if (id === "soft-lift") return <SoftLift />
  if (id === "outer-corner") return <OuterCorner />
  if (id === "quiet-set") return <QuietSet />
  return <NailNote />
}

function LashFan() {
  const strokes = upperLashes(250, [78, 110, 142, 168, 176, 160, 132, 96, 70])
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={cream} />
      <ellipse cx="168" cy="230" rx="120" ry="90" fill={beige} />
      <path
        d="M36 268 C 110 220, 220 220, 292 276"
        fill="none"
        stroke={espresso}
        strokeWidth="1.2"
      />
      {strokes.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function LashLine() {
  const strokes = upperLashes(210, [46, 70, 96, 118, 124, 108, 84, 58])
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={paper} />
      <path
        d="M28 214 H 292"
        stroke={beige}
        strokeWidth="10"
      />
      {strokes.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function SoftLift() {
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={cream} />
      <path
        d="M40 250 C 120 150, 210 150, 286 236"
        fill="none"
        stroke={cocoa}
        strokeWidth="1.4"
      />
      {upperLashes(236, [40, 64, 88, 104, 100, 78, 52]).map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function OuterCorner() {
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={paper} />
      <path
        d="M48 280 C 140 240, 230 220, 300 188"
        fill="none"
        stroke={espresso}
        strokeWidth="1.2"
      />
      {[
        "M90 268 C 84 220, 92 190, 98 168",
        "M132 256 C 128 198, 140 164, 150 138",
        "M176 244 C 178 176, 196 140, 214 112",
        "M220 230 C 232 168, 256 136, 280 112",
        "M258 214 C 276 160, 304 140, 328 124",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function QuietSet() {
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={beige} />
      <rect x="36" y="36" width="248" height="328" fill={paper} />
      {upperLashes(230, [28, 40, 52, 58, 52, 40, 30]).map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function NailNote() {
  return (
    <svg viewBox="0 0 320 400" aria-hidden className="h-full w-full">
      <rect width="320" height="400" fill={cream} />
      <path
        d="M132 96 C 132 72, 188 72, 188 96 V 250 C 188 286, 132 286, 132 250 Z"
        fill={paper}
        stroke={espresso}
        strokeWidth="1.2"
      />
      <path d="M132 126 H 188" stroke={beige} strokeWidth="8" />
    </svg>
  )
}
