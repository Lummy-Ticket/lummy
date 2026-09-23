// Dibuat oleh scripts/export-abi.mjs dari artefak Foundry. Jangan diedit manual.

import type { Address } from "viem";

export type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number };

export const DEPLOYMENTS: Partial<Record<number, Deployment>> = {};
