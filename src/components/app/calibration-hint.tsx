"use client";

import { useI18n } from "@/i18n/client";
import { Banner, btnPrimarySm, btnText } from "../ui";

/**
 * Until the first calibration: the map is computed from estimated capacities,
 * so it can drift from the real shelf. One tap opens a compartment ready to say
 * which record really comes first.
 */
export function CalibrationHint({ capacity, onCalibrate, onDismiss }: { capacity: number; onCalibrate: () => void; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <Banner className="flex flex-wrap items-center justify-between gap-2" role="status">
      <span className="min-w-[14rem] flex-1">{t("calibration.hint", { capacity })}</span>
      <span className="flex shrink-0 gap-1">
        <button type="button" onClick={onCalibrate} className={btnPrimarySm}>
          {t("calibration.start")}
        </button>
        <button type="button" onClick={onDismiss} className={btnText}>
          {t("calibration.later")}
        </button>
      </span>
    </Banner>
  );
}
