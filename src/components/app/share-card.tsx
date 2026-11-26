"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabase } from "@/lib/supabase/browser";
import { activeShareTokenRemote, createShareLinkRemote, revokeShareLinksRemote } from "@/lib/store/remote";
import { FRESHNESS_MS } from "@/lib/config";
import { useI18n } from "@/i18n/client";
import { LOCALE_TAGS } from "@/i18n/core";
import { btnPrimarySm, btnSecondarySm, card, input } from "../ui";

/**
 * Guest mode for the owner: create, copy, renew, or turn off the read-only
 * link. Guests only see the shelf while its Discogs data is less than six
 * hours old, so the card says until when, and "Update now" gives six more hours.
 */
export function ShareCard({
  signedIn,
  syncedAt = null,
  onUpdate,
  updating = false,
}: {
  signedIn: boolean;
  /** When the collection last synced with Discogs. */
  syncedAt?: string | null;
  onUpdate?: () => void;
  updating?: boolean;
}) {
  const { t, locale } = useI18n();
  const { userId } = useAuth();
  const supabase = useSupabase();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    let alive = true;
    activeShareTokenRemote(supabase)
      .then((tk) => alive && setToken(tk))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn, supabase]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch {
      setMessage(t("share.failed"));
    } finally {
      setBusy(false);
    }
  };

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : "";
  return (
    <section className={`${card} flex flex-col gap-3 p-[18px]`} aria-labelledby="share-heading">
      <h2 id="share-heading" className="font-display text-2xl text-ink">
        {t("share.title")}
      </h2>
      <p className="text-sm text-muted">{t("share.text")}</p>
      {!signedIn ? (
        <p className="text-sm text-ink">{t("share.signUp")}</p>
      ) : (
        <>
          {token && (
            <div className="flex flex-wrap gap-2">
              <label htmlFor="share-url" className="sr-only">
                {t("share.label")}
              </label>
              <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${input} min-w-0 flex-1 py-1.5 text-sm`} />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
                className={btnPrimarySm}
              >
                {copied ? t("share.copied") : t("share.copy")}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !supabase || !userId}
              onClick={() => void run(async () => setToken(await createShareLinkRemote(supabase!, userId!)))}
              className={token ? btnSecondarySm : btnPrimarySm}
            >
              {token ? t("share.new") : t("share.create")}
            </button>
            {token && (
              <button
                type="button"
                disabled={busy || !supabase}
                onClick={() =>
                  void run(async () => {
                    await revokeShareLinksRemote(supabase!);
                    setToken(null);
                    setMessage(t("share.revoked"));
                  })
                }
                className={`${btnSecondarySm} border-danger text-danger`}
              >
                {t("share.revoke")}
              </button>
            )}
          </div>
          {token && <Visibility syncedAt={syncedAt} locale={LOCALE_TAGS[locale]} onUpdate={onUpdate} updating={updating} />}
          {message && (
            <p className="text-sm text-ink" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Until when guests can see the shelf, and a way to give it six more hours. */
function Visibility({ syncedAt, locale, onUpdate, updating }: { syncedAt: string | null; locale: string; onUpdate?: () => void; updating: boolean }) {
  const { t } = useI18n();
  const until = syncedAt ? new Date(new Date(syncedAt).getTime() + FRESHNESS_MS) : null;
  // Read the clock once per render of this card (it's fine for it to be a little behind).
  const [now] = useState(() => Date.now());
  const visible = !!until && until.getTime() > now;
  const sameDay = !!until && new Date(now).toDateString() === until.toDateString();
  const time = until
    ? new Intl.DateTimeFormat(locale, sameDay ? { hour: "numeric", minute: "2-digit" } : { weekday: "long", hour: "numeric", minute: "2-digit" }).format(until)
    : "";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <p className="min-w-0 flex-1">{visible ? t("share.until", { time }) : t("share.expired")}</p>
      {onUpdate && (
        <button type="button" disabled={updating} onClick={onUpdate} className={btnSecondarySm}>
          {updating ? t("share.updating") : t("share.update")}
        </button>
      )}
    </div>
  );
}
