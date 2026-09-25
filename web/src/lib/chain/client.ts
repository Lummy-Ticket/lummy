"use client";

// Mode chain di browser: baca info dan status listing lewat /api/chain, kirim aksi dengan demo key.
// Tidak ada kunci di sini. Checkout baru jadi transaksi sungguhan kalau server sanggup menulis DAN
// perangkat ini memilih mode chain di panel dev, jadi pengunjung biasa dan demo-check tetap di data contoh.
import { useEffect, useState } from "react";

export type WriteMode = "off" | "open" | "key";

export type ChainInfo = {
  readable: boolean;
  writeMode: WriteMode;
  chainId?: number;
  escrow?: string;
  token?: string;
  disputeWindow?: number | null;
  priceUsdc?: string | null;
};

export type ChainStatus = "None" | "Listed" | "Funded" | "DisputeWindow" | "Released" | "Refunded" | "Cancelled";

export type ChainListing = {
  seller: string;
  buyer: string;
  price: string;
  handoverAt: number;
  eventEndsAt: number;
  status: ChainStatus;
  disputed: boolean;
  barcodeCommit: string;
  disputeWindow: number;
  deadline: number;
  /** Latest block time: the contract's clock, which decides when the window has passed. */
  now: number;
};

export type ChainOrderResult = { listingId: string; price: string; txs: { create: string; fund: string; handover: string } };
export type ChainActionResult = { tx: string; withdrawals: string[] };

const KEY_DEMO = "lummy:demo-key";
const KEY_ON = "lummy:chain-on";
const KEY_EVENT_ENDED = "lummy:demo-event-ended";
const KEY_ACCOUNTS = "lummy:demo-accounts";

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Mode privat atau storage diblokir: preferensi demo cukup hilang, app tetap jalan.
  }
}

/** Pilihan demo per perangkat, disimpan di localStorage. */
export const demoPrefs = {
  key: () => read(KEY_DEMO),
  setKey: (v: string) => write(KEY_DEMO, v.trim()),
  chainOn: () => read(KEY_ON) === "1",
  setChainOn: (v: boolean) => write(KEY_ON, v ? "1" : ""),
  /** Anggap acaranya sudah selesai saat checkout, supaya window testnet langsung berjalan. */
  eventEnded: () => read(KEY_EVENT_ENDED) === "1",
  setEventEnded: (v: boolean) => write(KEY_EVENT_ENDED, v ? "1" : ""),
  /** Dev Panel personas sign in to the demo accounts in the database, not sample personas. */
  accountsOn: () => read(KEY_ACCOUNTS) === "1",
  setAccountsOn: (v: boolean) => write(KEY_ACCOUNTS, v ? "1" : ""),
};

let infoPromise: Promise<ChainInfo> | null = null;

export function fetchChainInfo(): Promise<ChainInfo> {
  infoPromise ??= fetch("/api/chain")
    .then((r) => r.json() as Promise<ChainInfo>)
    .catch(() => ({ readable: false, writeMode: "off" as const }));
  return infoPromise;
}

export function useChainInfo() {
  const [info, setInfo] = useState<ChainInfo | null>(null);
  useEffect(() => {
    let alive = true;
    fetchChainInfo().then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** Server sanggup menulis, dan perangkat ini punya demo key kalau server memintanya. */
export function chainWritable(info: ChainInfo | null) {
  if (!info?.readable) return false;
  return info.writeMode === "open" || (info.writeMode === "key" && !!demoPrefs.key());
}

/** Checkout jadi on-chain cuma kalau perangkat ini juga memilih mode chain. */
export const chainCheckoutReady = (info: ChainInfo | null) => chainWritable(info) && demoPrefs.chainOn();

/** Nominal USDC (6 desimal) sebagai teks, tanpa menarik viem ke bundle halaman. */
export const usdcText = (units: string) => `${(Number(units) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDC`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const key = demoPrefs.key();
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-demo-key": key } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json as T;
}

export const openChainOrder = (eventEndsAt: number) => post<ChainOrderResult>("/api/chain/order", { eventEndsAt });

export const chainAction = (listingId: string, action: "dispute" | "resolve" | "release" | "refund", toBuyer?: string) =>
  post<ChainActionResult>("/api/chain/action", { listingId, action, toBuyer });

/** Status listing langsung dari kontrak, diperbarui berkala. */
export function useChainListing(listingId: string | undefined, intervalMs = 5000) {
  const [data, setData] = useState<ChainListing | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!listingId) return;
    let alive = true;
    const load = () =>
      fetch(`/api/chain/listing/${listingId}`)
        .then((r) => (r.ok ? (r.json() as Promise<ChainListing>) : null))
        .then((j) => {
          if (alive && j) setData(j);
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [listingId, intervalMs, nonce]);
  return { data, refresh: () => setNonce((n) => n + 1) };
}
