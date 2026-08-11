import { useEffect, useState, type ReactNode } from "react";
import { api, type EvalStats } from "../api";

/**
 * EstimatorEvaluation — "you vs team" performance panel. Four graphs, four buckets
 * each: QTN submissions, panels quoted, rework returns (lower better), first-time-clean
 * rate. All comparison is you vs the team MEDIAN + your percentile (not the average),
 * so one person's absence/outlier doesn't distort the benchmark. Fetches live data.
 */

type Period = "month" | "quarter";
const MONTH_LABELS = ["Wk 1", "Wk 2", "Wk 3", "Wk 4"];
const QUARTER_LABELS = ["P1", "P2", "P3", "P4"];

export default function EstimatorEvaluation() {
  const [data, setData] = useState<EvalStats | null>(null);
  const [period, setPeriod] = useState<Period>("month");

  useEffect(() => {
    let live = true;
    api.account.evaluation(period).then((d) => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [period]);

  const labels = period === "quarter" ? QUARTER_LABELS : MONTH_LABELS;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted">
          {period === "quarter" ? "Last ~3 months" : "Last 4 weeks"} · you vs team median
        </div>
        <div className="inline-flex gap-0.5 rounded-full bg-surface p-0.5">
          {(["month", "quarter"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPeriod(v)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                period === v ? "bg-brand text-white" : "text-muted hover:text-brand-dark"
              }`}
            >
              {v === "month" ? "Monthly" : "Quarter"}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-52" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Graph
            title="QTN submissions" sub="How many quotations you're producing" tone="brand" suffix=""
            weeks={data.submissions.weeks} labels={labels}
            stat={<><b className="text-ink">{data.submissions.youTotal}</b> you · <b className="text-ink">{data.submissions.teamMedian}</b> team median{data.submissions.percentileLabel && <> · <Good>{data.submissions.percentileLabel}</Good></>}</>}
          />
          <Graph
            title="Panels quoted" sub="Distinct panel types (a 20-off + 30-off project = 2, not 50)" tone="brand" suffix=""
            weeks={data.panels.weeks} labels={labels}
            stat={<><b className="text-ink">{data.panels.youTotal}</b> you · <b className="text-ink">{data.panels.teamMedian}</b> team median{data.panels.percentileLabel && <> · <Good>{data.panels.percentileLabel}</Good></>}</>}
          />
          <Graph
            title="Rework notes" badge="lower = better" sub="Returns asking you to fix a QTN before approval, per submission" tone="green" suffix=""
            weeks={data.rework.weeks} labels={labels}
            stat={<><b className="text-green-600 dark:text-green-400">{data.rework.youRate}</b> per QTN you · <b className="text-ink">{data.rework.teamMedian}</b> team median{data.rework.percentileLabel && <> · <Good>{data.rework.percentileLabel}</Good></>}</>}
          />
          <Graph
            title="First-time-clean rate" sub="Share of your approved QTNs with zero returns" tone="brand" suffix="%"
            weeks={data.clean.weeks} labels={labels}
            footer={<><b className="text-brand-dark">{data.clean.youAvg}%</b> avg you · <b className="text-ink">{data.clean.teamMedian}%</b> team median · <span className={`font-semibold ${data.clean.deltaPts >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{data.clean.deltaPts >= 0 ? "+" : ""}{data.clean.deltaPts} pts</span></>}
          />
        </div>
      )}
    </div>
  );
}

function Good({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-green-600 dark:text-green-400">{children}</span>;
}

function Graph({ title, sub, badge, stat, weeks, labels, suffix, tone, footer }: {
  title: string; sub: string; badge?: string; stat?: ReactNode;
  weeks: number[]; labels: string[]; suffix: string; tone: "brand" | "green"; footer?: ReactNode;
}) {
  const max = Math.max(...weeks, suffix === "%" ? 100 : 0.0001);
  const barColor = tone === "green" ? "bg-green-600 dark:bg-green-500" : "bg-brand";
  return (
    <div className="card bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`h-4 w-1 rounded-full ${tone === "green" ? "bg-green-600" : "bg-brand"}`} />
        <span className="text-sm font-bold text-ink">{title}</span>
        {badge && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">{badge}</span>}
      </div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
      {stat && <div className="mt-1 text-xs text-muted">{stat}</div>}

      <div className="mt-5 flex h-24 items-end gap-3">
        {weeks.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end justify-center">
              <div className={`relative w-1/2 rounded-t ${barColor}`} style={{ height: `${Math.max((v / max) * 100, 2)}%` }}>
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-ink">{v}{suffix}</span>
              </div>
            </div>
            <div className="text-[11px] text-muted/70">{labels[i]}</div>
          </div>
        ))}
      </div>

      {footer && <div className="mt-2 border-t border-line pt-2 text-xs text-muted">{footer}</div>}
    </div>
  );
}
