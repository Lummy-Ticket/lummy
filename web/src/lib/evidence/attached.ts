// Which claim photos a claim holds: the one on the claim itself and one on each answer. Only files
// outside this set are ever deleted early, by the daily purge (lib/retention-purge.ts) and before a
// new upload link (lib/evidence/server.ts, pruneUnattached). One rule for both, so a change to one
// can never let the other delete a photo a claim still shows (review, 4 Nov 2026).
import type { DisputeEvidence } from "@/lib/mock/types";

export type ClaimEvidence = { evidence: unknown; dispute_replies?: { evidence: unknown }[] | null } | null | undefined;

const pathOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as DisputeEvidence).upload?.path : undefined);

export function attachedEvidencePaths(claim: ClaimEvidence): Set<string> {
  const paths = new Set<string>();
  for (const v of [claim?.evidence, ...(claim?.dispute_replies ?? []).map((r) => r.evidence)]) {
    const path = pathOf(v);
    if (path) paths.add(path);
  }
  return paths;
}
