// Dibuat oleh scripts/export-abi.mjs dari artefak Foundry. Jangan diedit manual.

import type { Address } from "viem";

export type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number };

export const DEPLOYMENTS: Partial<Record<number, Deployment>> = {
  "421614": {
    "escrow": "0x6830Db86283157E4cB80b0615d4c51381A0C25Dd",
    "token": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "mockToken": false,
    "disputeWindow": 600
  }
};
