"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabase } from "@/lib/supabase/browser";
import { activeShareTokenRemote, createShareLinkRemote, revokeShareLinksRemote } from "@/lib/store/remote";
import { useI18n } from "@/i18n/client";
import { btnPrimarySm, btnSecondarySm, card, input } from "../ui";

/** Guest mode for the owner: create, copy, renew, or turn off the read-only link. */
export function ShareCard({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
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
          <p className="text-xs text-muted">{t("share.freshness")}</p>
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
