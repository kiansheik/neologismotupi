import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

function createStorageMock(): Storage {
  let store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store = new Map<string, string>();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

class MockAudioContext {
  currentTime = 0;
  destination = {};

  createOscillator() {
    return {
      type: "triangle",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
}

Object.defineProperty(window, "localStorage", {
  value: createStorageMock(),
  configurable: true,
});

Object.defineProperty(window, "sessionStorage", {
  value: createStorageMock(),
  configurable: true,
});

Object.defineProperty(window, "scrollTo", {
  value: vi.fn(),
  configurable: true,
});

Object.defineProperty(window, "AudioContext", {
  value: MockAudioContext,
  configurable: true,
});

Object.defineProperty(globalThis, "AudioContext", {
  value: MockAudioContext,
  configurable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
