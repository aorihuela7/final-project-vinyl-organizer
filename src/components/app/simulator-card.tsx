"use client";

import { useState } from "react";
import { simulatePurchases, type SimulationResult } from "@/lib/layout/simulate";
import { toLayoutRecord, toShelfSpecs, toSortSettings, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { useI18n } from "@/i18n/client";
import { btnPrimarySm, card } from "../ui";

const PURCHASES = 100;

/**
 * The purchase simulator: replay 100 purchases on this collection and shelves
 * with v1's naive insertion and with v2's minimum moves, and compare.
 */
export function SimulatorCard({ records, config }: { records: StoredRecord[]; config: ShelfConfig }) {
  const { t } = useI18n();
  // "now": the shelves and free space as they are; a number: how full the shelves end up after the purchases.
  const [scenario, setScenario] = useState<"now" | number>(98);
  const [result, setResult] = useState<{ scenario: "now" | number; data: SimulationResult } | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // Let the button show "Running…" before the (synchronous) simulation.
    setTimeout(() => {
      const data = simulatePurchases(records.map(toLayoutRecord), toShelfSpecs(config.furniture), toSortSettings(config.settings), {
        purchases: PURCHASES,
        seed: 2026,
        slackPct: config.settings.slackPct,
        fill: scenario === "now" ? undefined : scenario / 100,
      });
      setResult({ scenario, data });
      setRunning(false);
    }, 30);
  };

  const fewer = result ? result.data.naive.recordsMoved - result.data.minimum.recordsMoved : 0;
  return (
    <section className={`${card} flex flex-col gap-3 p-[18px]`} aria-labelledby="simulator-heading">
      <h2 id="simulator-heading" className="font-display text-2xl text-ink">
        {t("simulator.title")}
      </h2>
      <p className="text-sm text-muted">{t("simulator.text", { count: PURCHASES })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t("simulator.howFull")}
          <select
            value={String(scenario)}
            onChange={(e) => setScenario(e.target.value === "now" ? "now" : Number(e.target.value))}
            className="rounded-[18px] border border-input-line bg-white px-3.5 py-2 text-[15px] text-ink"
          >
            <option value="now">{t("simulator.asIs")}</option>
            {[90, 95, 98, 100].map((v) => (
              <option key={v} value={v}>
                {t("simulator.fullPct", { pct: v })}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={run} disabled={running || records.length === 0} className={btnPrimarySm}>
          {running ? t("simulator.running") : t("simulator.run", { count: PURCHASES })}
        </button>
      </div>
      {result && (
        <div className="grid gap-2" aria-live="polite">
          <div className="grid grid-cols-2 gap-2">
            <p className="rounded-card bg-meter-track p-3 text-sm text-ink">
              <span className="block text-muted">{t("simulator.naive")}</span>
              <strong className="font-display text-2xl font-normal">{t("simulator.moved", { count: result.data.naive.recordsMoved })}</strong>
            </p>
            <p className="surface-walnut rounded-card p-3 text-sm">
              <span className="block opacity-85">{t("simulator.minimum")}</span>
              <strong className="font-display text-2xl font-normal">{t("simulator.moved", { count: result.data.minimum.recordsMoved })}</strong>
            </p>
          </div>
          <p className="text-sm text-ink">
            {(() => {
              const label = result.scenario === "now" ? t("simulator.scenarioNow") : t("simulator.scenarioFull", { pct: result.scenario });
              return fewer > 0
                ? t("simulator.fewer", { count: fewer, purchases: result.data.purchases, scenario: label })
                : t("simulator.same", { purchases: result.data.purchases, scenario: label });
            })()}
          </p>
          <p className="text-xs text-muted">
            {t("simulator.details", {
              naiveDirect: result.data.naive.direct,
              minimumDirect: result.data.minimum.direct,
              naiveWorst: result.data.naive.worst,
              minimumWorst: result.data.minimum.worst,
            })}
          </p>
        </div>
      )}
    </section>
  );
}
