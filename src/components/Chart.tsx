import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Categorical colors, validated for color-blind separation on the dark card surface. Fixed order. */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface Point {
  x: number;
  y: number;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  points: Point[];
  /** Thin, faded line (e.g. raw weigh-ins behind a trend). */
  faint?: boolean;
  dashed?: boolean;
  dots?: boolean;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** About `count` round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const DAY = 86400_000;
const fmtDate = (ms: number, span: number) =>
  new Date(ms).toLocaleDateString(undefined, span > 300 * DAY ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' });

function xTicks(lo: number, hi: number, width: number): number[] {
  const n = Math.max(2, Math.min(6, Math.floor(width / 90)));
  if (hi <= lo) return [lo];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

interface Common {
  height?: number;
  yFormat: (v: number) => string;
  /** Horizontal reference line, e.g. a target. */
  refLine?: { y: number; label: string };
  /** Always include these values in the y range (e.g. 0). */
  yInclude?: number[];
  xDomain?: [number, number];
  empty?: ReactNode;
}

export function LineChart({
  series,
  height = 220,
  yFormat,
  refLine,
  yInclude = [],
  xDomain,
  empty,
  tooltipDate = true,
  legend = true,
  minSpan = 0,
}: Common & {
  series: Series[];
  tooltipDate?: boolean;
  legend?: boolean;
  /** Smallest y range shown, so tiny changes don't look huge (e.g. 4 lb of bodyweight). */
  minSpan?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);

  const geo = useMemo(() => {
    if (all.length === 0 || width === 0) return null;
    const xs = all.map((p) => p.x);
    const ys = [...all.map((p) => p.y), ...yInclude, ...(refLine ? [refLine.y] : [])];
    let [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
    if (x1 === x0) {
      x0 -= DAY;
      x1 += DAY;
    }
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    if (y1 - y0 < minSpan) {
      const mid = (y0 + y1) / 2;
      y0 = mid - minSpan / 2;
      y1 = mid + minSpan / 2;
    }
    const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.05 || 1;
    y0 -= pad;
    y1 += pad;
    const ticks = niceTicks(y0, y1);
    y0 = Math.min(y0, ticks[0]);
    y1 = Math.max(y1, ticks[ticks.length - 1]);
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * iw;
    const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * ih;
    return { x0, x1, sx, sy, ticks, iw, ih };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(series.map((s) => s.points)), width, height, xDomain?.[0], xDomain?.[1], refLine?.y, yInclude.join(), minSpan]);

  // Nearest x among all points, for the crosshair.
  const xsSorted = useMemo(() => [...new Set(all.map((p) => p.x))].sort((a, b) => a - b), [all]);
  useEffect(() => setHover(null), [series.length]);

  if (all.length === 0)
    return (
      <div className="chart" ref={ref}>
        <div className="chart-empty muted small">{empty ?? 'Nothing logged in this range yet.'}</div>
      </div>
    );

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = xsSorted[0];
    for (const x of xsSorted) if (Math.abs(geo.sx(x) - px) < Math.abs(geo.sx(best) - px)) best = x;
    setHover(best);
  };

  const hoverRows =
    hover == null
      ? []
      : (series
          .filter((s) => !s.faint || series.length === 1)
          .map((s) => {
            const p = s.points.find((q) => q.x === hover);
            return p ? { s, p } : null;
          })
          .filter(Boolean) as { s: Series; p: Point }[]);

  return (
    <div className="chart" ref={ref}>
      {geo && (
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.label).join(', ')}
        >
          {geo.ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={geo.sy(t)} y2={geo.sy(t)} />
              <text className="axis" x={PAD.left - 6} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {xTicks(geo.x0, geo.x1, width).map((t, i, arr) => (
            <text
              key={t}
              className="axis"
              x={geo.sx(t)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}
            >
              {fmtDate(t, geo.x1 - geo.x0)}
            </text>
          ))}
          {refLine && (
            <g>
              <line className="ref" x1={PAD.left} x2={width - PAD.right} y1={geo.sy(refLine.y)} y2={geo.sy(refLine.y)} />
              <text className="axis" x={width - PAD.right} y={geo.sy(refLine.y) - 5} textAnchor="end">
                {refLine.label}
              </text>
            </g>
          )}
          {series.map((s) => {
            const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${geo.sx(p.x).toFixed(1)},${geo.sy(p.y).toFixed(1)}`).join('');
            const showDots = s.dots ?? (!s.dashed && s.points.length <= 40);
            return (
              <g key={s.id} opacity={s.faint ? 0.45 : 1}>
                {s.points.length > 1 && (
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.faint ? 1.5 : 2}
                    strokeDasharray={s.dashed ? '5 5' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {(showDots || s.points.length === 1) &&
                  s.points.map((p) => (
                    <circle key={p.x} cx={geo.sx(p.x)} cy={geo.sy(p.y)} r={s.faint ? 2.5 : 3.5} fill={s.color} className="dot" />
                  ))}
              </g>
            );
          })}
          {hover != null && (
            <g>
              <line className="crosshair" x1={geo.sx(hover)} x2={geo.sx(hover)} y1={PAD.top} y2={height - PAD.bottom} />
              {hoverRows.map(({ s, p }) => (
                <circle key={s.id} cx={geo.sx(p.x)} cy={geo.sy(p.y)} r={5} fill={s.color} className="dot" />
              ))}
            </g>
          )}
        </svg>
      )}
      {geo && hover != null && hoverRows.length > 0 && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(geo.sx(hover), 80), width - 80),
          }}
        >
          {tooltipDate && (
            <div className="tt-date">
              {new Date(hover).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
          {hoverRows.map(({ s, p }) => (
            <div key={s.id} className="tt-row">
              <span className="swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong>{yFormat(p.y)}</strong>
            </div>
          ))}
        </div>
      )}
      {legend && series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.id} className={s.faint ? 'faint' : ''}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Bar {
  x: number;
  y: number;
  label: string;
  /** Marks a bar that met its goal; shown as a lighter fill. */
  muted?: boolean;
  /** This bar's own target, drawn as a short line across it. */
  target?: number;
}

export function BarChart({
  bars,
  height = 180,
  yFormat,
  refLine,
  color = SERIES_COLORS[0],
  xDomain,
  empty,
}: Common & { bars: Bar[]; color?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const hasTargets = bars.some((b) => b.target != null);
  if (bars.length === 0 || bars.every((b) => b.y === 0))
    return (
      <div className="chart" ref={ref}>
        <div className="chart-empty muted small">{empty ?? 'Nothing logged in this range yet.'}</div>
      </div>
    );

  const geo = (() => {
    if (width === 0) return null;
    const xs = bars.map((b) => b.x);
    const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
    const ys = [0, ...bars.map((b) => Math.max(b.y, b.target ?? 0)), ...(refLine ? [refLine.y] : [])];
    const ticks = niceTicks(0, Math.max(...ys) * 1.08, 3);
    const y1 = Math.max(ticks[ticks.length - 1], Math.max(...ys) * 1.08);
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const slots = Math.max(1, Math.round((x1 - x0) / Math.max(DAY, minGap(xs))) + 1);
    const slot = iw / slots;
    const bw = Math.max(2, Math.min(28, slot - 2));
    const sx = (x: number) => PAD.left + slot * ((x - x0) / Math.max(DAY, minGap(xs)) + 0.5);
    const sy = (y: number) => PAD.top + (1 - y / y1) * ih;
    return { x0, x1, sx, sy, ticks, bw };
  })();

  return (
    <div className="chart" ref={ref}>
      {geo && (
        <svg width={width} height={height} onPointerLeave={() => setHover(null)} role="img">
          {geo.ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={geo.sy(t)} y2={geo.sy(t)} />
              <text className="axis" x={PAD.left - 6} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {xTicks(geo.x0, geo.x1, width).map((t, i, arr) => (
            <text
              key={t}
              className="axis"
              x={geo.sx(t)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}
            >
              {fmtDate(t, geo.x1 - geo.x0)}
            </text>
          ))}
          {bars.map((b, i) => {
            const x = geo.sx(b.x) - geo.bw / 2;
            const top = geo.sy(b.y);
            const h = Math.max(0, geo.sy(0) - top);
            const r = Math.min(4, geo.bw / 2, h);
            // Rounded data end, square at the baseline.
            const d = `M${x},${geo.sy(0)}V${top + r}Q${x},${top} ${x + r},${top}H${x + geo.bw - r}Q${x + geo.bw},${top} ${x + geo.bw},${top + r}V${geo.sy(0)}Z`;
            return (
              <g key={b.x} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect x={x - 2} y={PAD.top} width={geo.bw + 4} height={geo.sy(0) - PAD.top} fill="transparent" />
                {h > 0 && <path d={d} fill={color} opacity={b.muted ? 0.55 : hover === i ? 1 : 0.9} />}
                {b.target != null && (
                  <line className="target-tick" x1={x - 2} x2={x + geo.bw + 2} y1={geo.sy(b.target)} y2={geo.sy(b.target)} />
                )}
              </g>
            );
          })}
          {refLine && (
            <g>
              <line className="ref" x1={PAD.left} x2={width - PAD.right} y1={geo.sy(refLine.y)} y2={geo.sy(refLine.y)} />
              <text className="axis ref-label" x={width - PAD.right} y={geo.sy(refLine.y) - 5} textAnchor="end">
                {refLine.label}
              </text>
            </g>
          )}
        </svg>
      )}
      {geo && hover != null && bars[hover] && (
        <div className="tooltip" style={{ left: Math.min(Math.max(geo.sx(bars[hover].x), 80), width - 80) }}>
          <div className="tt-date">{bars[hover].label}</div>
          <div className="tt-row">
            <span className="swatch" style={{ background: color }} />
            <strong>{yFormat(bars[hover].y)}</strong>
          </div>
          {bars[hover].target != null && (
            <div className="tt-row">
              <span className="swatch target-swatch" />
              <span>target</span>
              <strong>{yFormat(bars[hover].target!)}</strong>
            </div>
          )}
        </div>
      )}
      {hasTargets && (
        <div className="legend">
          <span>
            <span className="swatch" style={{ background: color }} />
            eaten
          </span>
          <span>
            <span className="swatch target-swatch" />
            target that day
          </span>
        </div>
      )}
    </div>
  );
}

function minGap(xs: number[]): number {
  const s = [...new Set(xs)].sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < s.length; i++) g = Math.min(g, s[i] - s[i - 1]);
  return g === Infinity ? DAY : g;
}
