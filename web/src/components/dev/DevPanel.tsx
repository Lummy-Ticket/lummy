"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FlaskConical, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, type Role } from "@/lib/mock";
import { useHydrated } from "@/lib/access";
import { useT } from "@/lib/i18n";
import { demoPrefs, useChainInfo } from "@/lib/chain/client";
import { openDemoAccount, useDemoAccounts, type DemoAccountsInfo } from "@/lib/demo-client";
import { useCatalogue } from "@/lib/catalogue";
import { supabaseBrowser } from "@/lib/supabase/browser";

const ROLES: { role: Role; en: string; id: string; home: string }[] = [
  { role: "BUYER", en: "Buyer", id: "Pembeli", home: "/" },
  { role: "SELLER", en: "Seller", id: "Penjual", home: "/seller" },
  { role: "ADMIN", en: "Admin", id: "Admin", home: "/admin" },
];

function Toggle({ label, checked, onChange, small }: { label: string; checked: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-2 cursor-pointer", small ? "mt-2 text-[11px] text-neutral-gray" : "text-xs text-neutral-black")}>
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#3A6CB4] cursor-pointer" />
    </label>
  );
}

/**
 * Presenter tools are chosen per device, so visitors and the rehearsal scripts stay on sample data
 * and sample personas. Only a presenter who switches them on (and, on lummy.id, holds the demo
 * key) sends real testnet transactions or signs in to the demo accounts in the database. Each
 * tool hides itself when the server cannot offer it.
 *
 * Mounted only after hydration, so every preference is read from this browser, not the server.
 */
function Panel({ onClose, accounts }: { onClose: () => void; accounts: DemoAccountsInfo | null }) {
  const t = useT();
  const router = useRouter();
  const user = useUser((s) => s.user);
  const login = useUser((s) => s.login);
  const logout = useUser((s) => s.logout);
  const catalogueSource = useCatalogue().source;
  const chain = useChainInfo();
  const [chainOn, setChainOn] = useState(() => demoPrefs.chainOn());
  const [ended, setEnded] = useState(() => demoPrefs.eventEnded());
  const [accountsOn, setAccountsOn] = useState(() => demoPrefs.accountsOn());
  const [key, setKey] = useState(() => demoPrefs.key());
  const [busy, setBusy] = useState<Role | null>(null);

  const chainShown = !!chain?.readable && chain.writeMode !== "off";
  const accountsShown = !!accounts?.available;
  const needsKey =
    (chainShown && chainOn && chain?.writeMode === "key") || (accountsShown && accountsOn && accounts?.mode === "key");
  const chainReady = chainShown && chainOn && (chain?.writeMode === "open" || !!key);
  const accountsReady = accountsShown && accountsOn && (accounts?.mode === "open" || !!key);
  // Until the server has said whether it offers demo accounts, a click could land on the wrong
  // kind of persona, so the buttons wait.
  const accountsLoading = accountsOn && accounts === null;

  const pick = async (r: (typeof ROLES)[number]) => {
    if (accountsReady) {
      setBusy(r.role);
      const res = await openDemoAccount(r.role);
      if (!res.ok) {
        setBusy(null);
        toast.error(res.error);
        return;
      }
      // A full load picks up the session cookies the server just set.
      window.location.assign(r.home);
      return;
    }
    login(r.role);
    router.push(r.home);
  };

  const reset = async () => {
    await supabaseBrowser()?.auth.signOut().catch(() => undefined);
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="w-64 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-secondary-pink-dark" /> {t("Dev panel", "Panel dev")}
        </span>
        <button onClick={onClose} className="text-neutral-gray cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-neutral-gray mb-1">{t("Prototype mode. Orders are sample data unless chain mode is on.", "Mode prototipe. Pesanan adalah data contoh, kecuali mode chain menyala.")}</p>
      <p className="text-xs text-neutral-gray mb-3" data-catalogue-source={catalogueSource}>
        {catalogueSource === "database"
          ? t("Catalogue: from the database.", "Katalog: dari database.")
          : t("Catalogue: sample data.", "Katalog: data contoh.")}
      </p>

      {(chainShown || accountsShown) && (
        <div className="mb-3 rounded-xl border border-neutral-light-gray-1 p-2.5 flex flex-col gap-2">
          {accountsShown && (
            <Toggle
              label={t("Personas sign in to demo accounts", "Persona masuk ke akun demo")}
              checked={accountsOn}
              onChange={(v) => { setAccountsOn(v); demoPrefs.setAccountsOn(v); }}
            />
          )}
          {chainShown && (
            <div>
              <Toggle
                label={t("Real testnet transactions", "Transaksi testnet sungguhan")}
                checked={chainOn}
                onChange={(v) => { setChainOn(v); demoPrefs.setChainOn(v); }}
              />
              {chainOn && (
                <Toggle
                  small
                  label={t("Treat the show as over (window starts at checkout)", "Anggap acara sudah selesai (window mulai saat checkout)")}
                  checked={ended}
                  onChange={(v) => { setEnded(v); demoPrefs.setEventEnded(v); }}
                />
              )}
            </div>
          )}
          {needsKey && (
            <input
              type="password"
              value={key}
              placeholder={t("Demo key", "Demo key")}
              onChange={(e) => { setKey(e.target.value); demoPrefs.setKey(e.target.value); }}
              className="w-full rounded-lg border border-neutral-light-gray-1 focus:border-lummy-500 px-2 py-1 text-xs outline-none"
            />
          )}
          {chainShown && (
            <p className="text-[11px] text-neutral-gray">
              {chainReady
                ? t("New checkouts lock test USDC in the escrow on Arbitrum Sepolia.", "Checkout baru mengunci USDC testnet di escrow Arbitrum Sepolia.")
                : t("Chain off: new checkouts are sample orders.", "Chain mati: checkout baru jadi pesanan contoh.")}
            </p>
          )}
        </div>
      )}

      <div className="text-xs text-neutral-gray mb-1">
        {accountsReady ? t("Persona (demo account)", "Persona (akun demo)") : t("Persona (sample)", "Persona (contoh)")}
      </div>
      <div className="grid grid-cols-3 gap-1 mb-1.5">
        {ROLES.map((r) => (
          <button
            key={r.role}
            disabled={!!busy || accountsLoading}
            onClick={() => void pick(r)}
            className={cn(
              "px-2 py-1.5 rounded-lg text-xs border transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-60",
              user?.role === r.role
                ? "bg-lummy-500 text-white border-lummy-500"
                : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-lummy-500"
            )}
          >
            {busy === r.role && <Loader2 className="w-3 h-3 animate-spin" />}
            {t(r.en, r.id)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-neutral-gray mb-3 truncate" data-identity={user?.account ? "account" : user ? "sample" : "none"}>
        {user?.account
          ? t(`Signed in: ${user.email}`, `Masuk sebagai: ${user.email}`)
          : user
            ? t("Sample persona in this browser.", "Persona contoh di browser ini.")
            : t("Signed out.", "Belum masuk.")}
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => (user ? logout() : login("BUYER"))}
          className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer"
        >
          {user ? t("Sign out", "Keluar") : t("Sign in", "Masuk")}
        </button>
        <button
          onClick={() => void reset()}
          className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer flex items-center justify-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> {t("Reset", "Reset")}
        </button>
      </div>
    </div>
  );
}

export default function DevPanel() {
  const t = useT();
  const mounted = useHydrated();
  const [open, setOpen] = useState(false);
  // Asked at page load, not when the panel opens, so the answer is there before the first click.
  const accounts = useDemoAccounts();
  if (!mounted) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <Panel onClose={() => setOpen(false)} accounts={accounts} />
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("Dev panel", "Panel dev")}
          className="w-12 h-12 rounded-full bg-primary-navy text-white grid place-items-center shadow-lummy-lg hover:bg-primary-navy-dark transition cursor-pointer"
        >
          <FlaskConical className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
