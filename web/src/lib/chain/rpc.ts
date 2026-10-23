// Jalur ke node chain dari server dan skrip. RPC berbayar (LUMMY_RPC_URL) dicoba dulu kalau diisi, lalu RPC
// publik, lewat transport fallback viem. RPC publik kadang menjawab "fetch failed" atau menggantung, jadi
// tiap permintaan dibatasi waktunya dan diulang.
import { fallback, http, keccak256, type Chain, type Hex, type Transport } from "viem";
import { RPC_URLS } from "./config";

/** Per node: satu ulangan cepat (jaringan putus, 429, 5xx), dan batas waktu supaya node yang menggantung tidak menahan halaman. */
const NODE = { retryCount: 1, retryDelay: 250, timeout: 6_000 };
/** Setelah semua node gagal: satu putaran lagi atas seluruh daftar. */
const ROUND = { retryCount: 1, retryDelay: 500 };

/** RPC satu chain, urut dicoba: LUMMY_RPC_URL (cuma untuk chain app, LUMMY_CHAIN_ID) kalau diisi, lalu RPC publik. */
export function rpcUrls(chainId: number): string[] {
  const paid = chainId === Number(process.env.LUMMY_CHAIN_ID ?? 421614) ? process.env.LUMMY_RPC_URL?.trim() : undefined;
  return [...new Set([paid, RPC_URLS[chainId]].filter((u): u is string => !!u))];
}

/**
 * Transport baca. URL yang termasuk rpcUrls chain-nya memakai seluruh daftar itu lewat fallback; URL lain
 * (fork Anvil di skrip) dipakai sendiri, karena node lain tidak punya state-nya.
 */
export function rpcTransport(chain: Chain, url: string): Transport {
  const urls = rpcUrls(chain.id);
  if (!urls.includes(url)) return http(url, NODE);
  return fallback(
    urls.map((u) => http(u, NODE)),
    ROUND
  );
}

/**
 * Transport untuk transaksi: sama dengan transport baca, plus satu pengaman. Nonce dipilih dan transaksi
 * ditandatangani sekali, sebelum sampai ke transport, jadi yang diulang (retry, atau node berikutnya di
 * fallback) selalu byte yang sama: hash dan nonce yang sama, yang paling banyak masuk sekali ke chain.
 * Kalau kiriman pertama sudah sampai tapi balasannya hilang, ulangannya bisa dijawab "already known" atau
 * "nonce too low"; hash-nya lalu dicek di chain, dan yang sudah ada dianggap terkirim, bukan gagal.
 */
export function writeTransport(chain: Chain, url: string): Transport {
  const base = rpcTransport(chain, url);
  return (opts) => {
    const t = base(opts);
    const send = t.request as (args: { method: string; params?: unknown }, options?: unknown) => Promise<unknown>;
    const request = async (args: { method: string; params?: unknown }, options?: unknown) => {
      if (args.method !== "eth_sendRawTransaction") return send(args, options);
      const hash = keccak256((args.params as [Hex])[0]);
      try {
        return await send(args, options);
      } catch (e) {
        if (await landed(send, hash)) return hash;
        throw e;
      }
    };
    return { ...t, request: request as typeof t.request };
  };
}

/** Transaksi dengan hash ini sudah dikenal chain? Dicek beberapa kali, karena node bisa sedikit tertinggal. */
async function landed(send: (args: { method: string; params?: unknown }) => Promise<unknown>, hash: Hex): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1000));
    if (await send({ method: "eth_getTransactionByHash", params: [hash] }).catch(() => null)) return true;
  }
  return false;
}
