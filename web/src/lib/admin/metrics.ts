// What /api/admin/metrics answers: counts per rolling week, newest first, and the total.
export type MetricRow = { key: "accounts" | "listings" | "held" | "requests" | "orders" | "claims"; weeks: number[]; total: number };
export type BetaMetrics = { rows: MetricRow[]; reviewHours: number | null; since: string };
