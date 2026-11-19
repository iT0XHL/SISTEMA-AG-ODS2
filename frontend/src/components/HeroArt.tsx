import type { CSSProperties } from "react";

interface Route {
  color: string;
  delay: number;
  path: string;
  nodes: [number, number][];
}

const DEPOT: [number, number] = [150, 210];

const ROUTES: Route[] = [
  {
    color: "var(--series-1)",
    delay: 0,
    path: "M150 210 L210 110 L300 70 L390 115 L330 175 L150 210",
    nodes: [
      [210, 110],
      [300, 70],
      [390, 115],
      [330, 175],
    ],
  },
  {
    color: "var(--series-2)",
    delay: 0.9,
    path: "M150 210 L230 290 L320 335 L420 300 L470 230 L150 210",
    nodes: [
      [230, 290],
      [320, 335],
      [420, 300],
      [470, 230],
    ],
  },
  {
    color: "var(--series-3)",
    delay: 1.8,
    path: "M150 210 L90 120 L50 190 L95 300 L150 210",
    nodes: [
      [90, 120],
      [50, 190],
      [95, 300],
    ],
  },
];

const IDLE: [number, number][] = [
  [445, 150],
  [150, 350],
  [515, 90],
];

export function HeroArt() {
  return (
    <figure className="hero-art" style={{ margin: 0 }}>
      <svg
        viewBox="0 0 560 400"
        role="img"
        aria-label="Esquema ilustrativo de tres rutas que parten del depósito"
      >
        {ROUTES.map((route) => (
          <path
            key={route.color}
            className="art-route"
            d={route.path}
            pathLength={1}
            stroke={route.color}
            style={{ "--delay": `${route.delay}s` } as CSSProperties}
          />
        ))}
        {IDLE.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={7}
            fill="var(--surface)"
            stroke="var(--ink-3)"
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        ))}
        {ROUTES.flatMap((route) =>
          route.nodes.map(([x, y], index) => (
            <circle
              key={`${route.color}-${x}-${y}`}
              className="art-node on"
              cx={x}
              cy={y}
              r={8}
              style={
                {
                  "--c": route.color,
                  "--delay": `${route.delay + index * 0.35}s`,
                } as CSSProperties
              }
            />
          )),
        )}
        <g transform={`translate(${DEPOT[0] - 13} ${DEPOT[1] - 13})`}>
          <rect
            width="26"
            height="26"
            rx="5"
            fill="var(--ink)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
          <text
            x="13"
            y="18"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="13"
            fontWeight="600"
            fill="var(--surface)"
          >
            D
          </text>
        </g>
      </svg>
      <figcaption className="art-caption">Esquema ilustrativo, no es una corrida real</figcaption>
    </figure>
  );
}
