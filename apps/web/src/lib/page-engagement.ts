const CURRENT_KEY = "participation_current";
const PENDING_KEY = "participation_pending";

export type EngagementTier = "poor" | "fair" | "excellent";

interface CurrentTracking {
  pageId: string;
  totalWeight: number;
  votedWeight: number;
}

export interface PendingEngagement {
  pageId: string;
  tier: EngagementTier;
}

// Weights mirror the backend config defaults.
export const VOTE_WEIGHTS = {
  entry: 3,
  example: 2,
  comment: 1,
} as const;

export function startPageTracking(
  pageId: string,
  opportunities: { entries: number; examples: number; comments: number },
): void {
  const totalWeight =
    opportunities.entries * VOTE_WEIGHTS.entry +
    opportunities.examples * VOTE_WEIGHTS.example +
    opportunities.comments * VOTE_WEIGHTS.comment;

  if (totalWeight === 0) return;

  try {
    sessionStorage.setItem(
      CURRENT_KEY,
      JSON.stringify({ pageId, totalWeight, votedWeight: 0 } satisfies CurrentTracking),
    );
  } catch {
    // sessionStorage unavailable (private browsing edge cases) — degrade silently
  }
}

export function recordPageVote(type: keyof typeof VOTE_WEIGHTS): void {
  try {
    const raw = sessionStorage.getItem(CURRENT_KEY);
    if (!raw) return;
    const current: CurrentTracking = JSON.parse(raw);
    current.votedWeight += VOTE_WEIGHTS[type];
    sessionStorage.setItem(CURRENT_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function finalizeCurrentPage(): void {
  try {
    const raw = sessionStorage.getItem(CURRENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CURRENT_KEY);

    const { pageId, totalWeight, votedWeight }: CurrentTracking = JSON.parse(raw);
    if (totalWeight === 0) return;

    const rate = Math.min(1, votedWeight / totalWeight);
    const tier: EngagementTier = rate >= 0.67 ? "excellent" : rate >= 0.33 ? "fair" : "poor";

    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ pageId, tier } satisfies PendingEngagement));
  } catch {
    // ignore
  }
}

/** Read and clear the pending engagement left by the previous page. */
export function consumePendingEngagement(): PendingEngagement | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as PendingEngagement;
  } catch {
    return null;
  }
}
