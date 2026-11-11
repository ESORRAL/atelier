import { useEffect, useState } from "react";
import { ChartBar } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { usageSummary, type UsageSummary } from "../../ipc/usage";
import { buildSeries, fmtTokens, fmtUsd, isEmpty, totalTokens } from "./series";
import "./usage.css";

const RANGES = [7, 30, 90];
const W = 600;
const H = 160;
const color = (i: number) => `var(--color-chart-${i + 1})`;

export default function Usage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setError(false);
    usageSummary(days).then(
      (d) => live && setData(d),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [days]);

  if (error) return <EmptyState icon={ChartBar} title="Usage" text="Impossible de lire l'usage." />;
  if (data && isEmpty(data)) return <EmptyState icon={ChartBar} title="Usage" text="Tes sessions apparaîtront ici" />;

  const s = data && buildSeries(data);
  const step = s ? W / Math.max(1, s.bars.length) : W;
  const bw = Math.max(1, step * 0.7);

  return (
    <section className="usage" aria-label="Usage">
      <div className="usage__head">
        <h1>Usage</h1>
        <div className="usage__range" role="group" aria-label="Période">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === days} onClick={() => setDays(r)}>
              {r} j
            </button>
          ))}
        </div>
        {data && (
          <p className="usage__total">
            Total {fmtUsd(data.totalCostUsd)} · {fmtTokens(totalTokens(data))} tokens
          </p>
        )}
      </div>
      {data && s && (
        <>
          <figure className="usage__fig">
            <figcaption>Coût par jour</figcaption>
            <svg
              className="usage__svg"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Coût par jour sur ${days} jours, maximum ${fmtUsd(s.max)}`}
            >
              <line className="usage__grid" x1="0" x2={W} y1={H} y2={H} />
              <line className="usage__grid" x1="0" x2={W} y1="0" y2="0" />
              {s.bars.map((b, i) => {
                let y = H;
                return (
                  <g key={b.day}>
                    <title>{`${b.day} : ${fmtUsd(b.total)}`}</title>
                    {b.segs.map((g) => {
                      const h = (g.cost / s.max) * (H - 2);
                      y -= h;
                      return (
                        <rect
                          key={g.model}
                          className="usage__seg"
                          fill={color(s.models.indexOf(g.model))}
                          x={i * step + (step - bw) / 2}
                          y={y}
                          width={bw}
                          height={h}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <ul className="usage__legend" aria-label="Légende">
              {s.models.map((m, i) => (
                <li key={m}>
                  <span className="usage__swatch" style={{ background: color(i) }} aria-hidden="true" />
                  {m}
                </li>
              ))}
            </ul>
            <table className="sr-only">
              <caption>Coût par jour</caption>
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col">Coût</th>
                </tr>
              </thead>
              <tbody>
                {s.bars.map((b) => (
                  <tr key={b.day}>
                    <th scope="row">{b.day}</th>
                    <td>{fmtUsd(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
          <figure className="usage__fig">
            <figcaption>Par modèle</figcaption>
            <table className="usage__table">
              <thead>
                <tr>
                  <th scope="col">Modèle</th>
                  <th scope="col">Entrée</th>
                  <th scope="col">Sortie</th>
                  <th scope="col">Coût</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byModel)
                  .sort((a, b) => b[1].costUsd - a[1].costUsd)
                  .map(([m, u]) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td>{fmtTokens(u.inputTokens)}</td>
                      <td>{fmtTokens(u.outputTokens)}</td>
                      <td>{fmtUsd(u.costUsd)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </figure>
        </>
      )}
    </section>
  );
}
