// Dibuat oleh scripts/export-abi.mjs dari artefak Foundry. Jangan diedit manual.

import type { Address } from "viem";

export type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number; deployBlock?: number };

export type LedgerDeployment = { ledger: Address; disputeWindow: number; deployBlock?: number };

export type IntentsDeployment = { factory: Address; escrow: Address };

export const DEPLOYMENTS: Partial<Record<number, Deployment>> = {
  "42161": {
    "escrow": "0x68d535494bf33a6F483A945683Ab629D036d3cb3",
    "token": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "mockToken": false,
    "disputeWindow": 172800,
    "deployBlock": 522630118
  },
  "421614": {
    "escrow": "0x6830Db86283157E4cB80b0615d4c51381A0C25Dd",
    "token": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "mockToken": false,
    "disputeWindow": 600,
    "deployBlock": 312132461
  }
};

export const LEDGERS: Partial<Record<number, LedgerDeployment>> = {
  "421614": {
    "ledger": "0xe454cbc81916E9bE1e6A768715134568FCEE8b0E",
    "disputeWindow": 172800,
    "deployBlock": 317357843
  }
};

export const INTENTS: Partial<Record<number, IntentsDeployment>> = {
  "42161": {
    "factory": "0x3dFc2bFFBfC17F1e5F741E0dCD04e8F24dd6b75C",
    "escrow": "0x68d535494bf33a6F483A945683Ab629D036d3cb3"
  }
};
