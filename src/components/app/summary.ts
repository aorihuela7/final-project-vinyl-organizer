import type { Translator } from "@/i18n/core";
import type { SettingsConfig } from "@/lib/shelf/model";

/** "1,725 records, sorted by artist, then title, with 10% free space": plain words, no middle dots. */
export function collectionSummary(t: Translator["t"], count: number, settings: SettingsConfig): string {
  const levels = settings.sortLevels.map((l) => t(`levels.${l}`));
  const sortedBy = levels.length > 1 ? t("app.levelJoin", { first: levels[0]!, rest: levels.slice(1).join(t("app.levelThen")) }) : levels[0]!;
  const summary = t("app.summary", { count, levels: sortedBy, slack: settings.slackPct });
  return settings.ignoreArticles ? t("app.summaryArticles", { summary }) : summary;
}
