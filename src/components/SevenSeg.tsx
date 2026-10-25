import type { ReactElement } from 'react';

const W = 20;
const H = 36;
const T = 3.6; // segment thickness
const G = 0.8; // gap between segments

const DIGITS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

function hSeg(yc: number): string {
  const x1 = T / 2 + G;
  const x2 = W - T / 2 - G;
  const h = T / 2;
  return `${x1},${yc} ${x1 + h},${yc - h} ${x2 - h},${yc - h} ${x2},${yc} ${x2 - h},${yc + h} ${x1 + h},${yc + h}`;
}

function vSeg(xc: number, y1: number, y2: number): string {
  const h = T / 2;
  return `${xc},${y1} ${xc + h},${y1 + h} ${xc + h},${y2 - h} ${xc},${y2} ${xc - h},${y2 - h} ${xc - h},${y1 + h}`;
}

const SEGMENTS: Record<string, string> = {
  a: hSeg(T / 2),
  g: hSeg(H / 2),
  d: hSeg(H - T / 2),
  f: vSeg(T / 2, T / 2 + G, H / 2 - G),
  b: vSeg(W - T / 2, T / 2 + G, H / 2 - G),
  e: vSeg(T / 2, H / 2 + G, H - T / 2 - G),
  c: vSeg(W - T / 2, H / 2 + G, H - T / 2 - G),
};

const DIGIT_ADV = W + 6;
const COLON_ADV = 10;

/** A digital-clock style display for strings of digits and colons, e.g. "01:23:45". */
export function SevenSeg({ text, className }: { text: string; className?: string }) {
  let x = 0;
  const parts: ReactElement[] = [];
  [...text].forEach((ch, i) => {
    if (ch === ':') {
      parts.push(
        <g key={i} transform={`translate(${x} 0)`} className="seg-on">
          <rect x={1.5} y={H * 0.3} width={T} height={T} />
          <rect x={1.5} y={H * 0.68 - T} width={T} height={T} />
        </g>,
      );
      x += COLON_ADV;
      return;
    }
    const lit = DIGITS[ch] ?? '';
    parts.push(
      <g key={i} transform={`translate(${x} 0)`}>
        {Object.entries(SEGMENTS).map(([name, pts]) => (
          <polygon key={name} points={pts} className={lit.includes(name) ? 'seg-on' : 'seg-off'} />
        ))}
      </g>,
    );
    x += DIGIT_ADV;
  });
  const width = x - 6 + 4;
  return (
    <svg
      className={`sevenseg ${className ?? ''}`}
      viewBox={`-2 -1 ${width + 2} ${H + 2}`}
      role="img"
      aria-label={text}
    >
      <g transform="skewX(-6) translate(4 0)">{parts}</g>
    </svg>
  );
}
