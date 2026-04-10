import { useSyncExternalStore } from "react";

type VoteType = "entry" | "example" | "audio" | "comment" | "list";
type VoteValue = -1 | 1;

interface VoteRecord {
  value: VoteValue;
  updatedAt: number;
}

type VoteStore = Record<string, VoteRecord>;

const STORAGE_KEY = "nheenga:vote-memory:v1";

let cachedStore: VoteStore | null = null;
let version = 0;
const listeners = new Set<() => void>();

function safeParseStore(raw: string | null): VoteStore {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as VoteStore;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // ignore invalid cache
  }
  return {};
}

function getStore(): VoteStore {
  if (cachedStore) {
    return cachedStore;
  }
  if (typeof window === "undefined") {
    cachedStore = {};
    return cachedStore;
  }
  cachedStore = safeParseStore(window.localStorage.getItem(STORAGE_KEY));
  return cachedStore;
}

function persistStore(store: VoteStore) {
  cachedStore = store;
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage write errors
  }
}

function makeKey(userId: string, type: VoteType, id: string | number): string {
  return `${userId}:${type}:${id}`;
}

function emitChange() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeVoteMemory(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVoteMemoryVersion() {
  return version;
}

export function useVoteMemoryVersion() {
  return useSyncExternalStore(subscribeVoteMemory, getVoteMemoryVersion, getVoteMemoryVersion);
}

export function getCachedVote(
  userId: string | null | undefined,
  type: VoteType,
  id: string | number,
): VoteValue | null {
  if (!userId) {
    return null;
  }
  const key = makeKey(userId, type, id);
  const record = getStore()[key];
  return record?.value ?? null;
}

export function setCachedVote(
  userId: string | null | undefined,
  type: VoteType,
  id: string | number,
  value: VoteValue,
) {
  if (!userId) {
    return;
  }
  const store = { ...getStore() };
  store[makeKey(userId, type, id)] = { value, updatedAt: Date.now() };
  persistStore(store);
  emitChange();
}

export function clearCachedVote(
  userId: string | null | undefined,
  type: VoteType,
  id: string | number,
) {
  if (!userId) {
    return;
  }
  const store = { ...getStore() };
  delete store[makeKey(userId, type, id)];
  persistStore(store);
  emitChange();
}

export function resolveVote(
  serverVote: number | null | undefined,
  cachedVote: VoteValue | null | undefined,
): number {
  if (serverVote !== null && serverVote !== undefined) {
    return serverVote;
  }
  if (cachedVote !== null && cachedVote !== undefined) {
    return cachedVote;
  }
  return 0;
}
