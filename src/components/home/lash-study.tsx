const espresso = "#38231E"
const cocoa = "#745244"
const beige = "#E1CDBB"
const paper = "#FCF9F4"

export function LashStudy({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 560"
      role="img"
      aria-label="Illustrated lash study in espresso and cream"
      className={className}
    >
      <rect width="480" height="560" fill={paper} />
      <ellipse cx="250" cy="280" rx="190" ry="210" fill={beige} />
      <ellipse cx="168" cy="210" rx="70" ry="46" fill={cocoa} opacity="0.28" />
      <path
        d="M78 312 C 150 214, 330 214, 412 312 C 334 356, 156 356, 78 312 Z"
        fill={paper}
      />
      <path
        d="M92 308 C 160 236, 324 236, 398 308"
        fill="none"
        stroke={espresso}
        strokeWidth="1.4"
      />
      <path
        d="M104 314 C 168 268, 318 268, 386 314"
        fill="none"
        stroke={espresso}
        strokeWidth="1"
        opacity="0.7"
      />
      {[
        "M118 292 C 108 214, 132 188, 146 168",
        "M150 274 C 146 186, 168 156, 178 132",
        "M186 262 C 186 168, 204 132, 210 104",
        "M222 256 C 226 158, 236 118, 236 86",
        "M258 256 C 262 156, 268 112, 274 84",
        "M294 262 C 304 164, 318 128, 332 102",
        "M328 274 C 344 184, 366 154, 386 136",
        "M358 292 C 378 214, 402 196, 424 178",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ))}
      {[
        "M128 300 C 122 236, 140 210, 150 192",
        "M206 268 C 208 190, 216 164, 220 142",
        "M276 268 C 284 188, 294 158, 304 136",
        "M346 298 C 360 232, 378 210, 394 192",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={espresso}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.8"
        />
      ))}
      <path
        d="M120 330 C 190 358, 300 358, 372 330"
        fill="none"
        stroke={cocoa}
        strokeWidth="1.2"
      />
      <circle cx="246" cy="304" r="16" fill={espresso} opacity="0.12" />
    </svg>
  )
}
