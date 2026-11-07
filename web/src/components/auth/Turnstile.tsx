"use client";

// Cloudflare Turnstile on the email sign-in form (production audit 2 Nov 2026, stage 5: before a big
// promotion, so a script cannot make Lummy send sign-in emails to strangers). Shown only when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; without it the form is as it was. Supabase Auth checks the
// token itself, with the secret key set in its dashboard (docs/config/07-turnstile.md). The order
// matters: the site key goes to Vercel and is deployed first, then Supabase's CAPTCHA setting is
// switched on, or every email sign-in fails in between.
import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi | null> | null = null;

/** Cloudflare's script, loaded once for the page; null when it cannot load (blocked, offline). */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The check itself. `onToken` gets a token once Cloudflare is satisfied and null when it expires or
 * fails; a token works once, so the form bumps `round` after each send to get a fresh one.
 */
export function Turnstile({ onToken, round, lang }: { onToken: (token: string | null) => void; round: number; lang: "en" | "id" }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let gone = false;
    void loadTurnstile().then((api) => {
      if (gone || !api || !box.current) return;
      widget.current = api.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: lang,
        appearance: "interaction-only",
        callback: (token: string) => report.current(token),
        "expired-callback": () => report.current(null),
        "error-callback": () => report.current(null),
      });
    });
    return () => {
      gone = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [lang]);

  // A used token is spent: start a new check for the next send.
  useEffect(() => {
    if (round > 0 && widget.current && window.turnstile) {
      report.current(null);
      window.turnstile.reset(widget.current);
    }
  }, [round]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} data-turnstile className="mt-3 flex justify-center" />;
}
