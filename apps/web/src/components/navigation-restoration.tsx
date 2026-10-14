import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import {
  readNavigationState,
  writeNavigationState,
} from "@/lib/navigation-state";

type ScrollPosition = { x: number; y: number };

/** Restore after async results have made the document tall enough to scroll. */
export function NavigationRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef<{ pathname: string; hash: string } | null>(null);

  useLayoutEffect(() => {
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = original;
    };
  }, []);

  useLayoutEffect(() => {
    const key = `scroll:${location.key}:${location.pathname}${location.search}${location.hash}`;
    const samePage =
      previous.current?.pathname === location.pathname &&
      previous.current.hash === location.hash;
    previous.current = { pathname: location.pathname, hash: location.hash };
    const saved = readNavigationState<ScrollPosition>(key, { x: -1, y: -1 });
    const hasSaved =
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y) &&
      saved.x >= 0 &&
      saved.y >= 0;
    const position = hasSaved ? saved : { x: 0, y: 0 };
    const shouldRestore = navigationType === "POP";
    // Keep the intended position if another navigation/reload interrupts restoration.
    let latest = shouldRestore
      ? position
      : samePage
        ? { x: window.scrollX, y: window.scrollY }
        : { x: 0, y: 0 };
    let frame = 0;
    let restoring = shouldRestore || Boolean(location.hash) || !samePage;
    const started = performance.now();

    function record() {
      if (!restoring) latest = { x: window.scrollX, y: window.scrollY };
    }
    function save() {
      record();
      writeNavigationState(key, latest);
    }
    function cancel() {
      restoring = false;
      cancelAnimationFrame(frame);
      record();
    }
    function restore() {
      if (!restoring) return;
      let target = shouldRestore ? position : { x: 0, y: 0 };
      let anchor: HTMLElement | null = null;
      if (location.hash && (!shouldRestore || !hasSaved)) {
        try {
          anchor = document.getElementById(
            decodeURIComponent(location.hash.slice(1)),
          );
        } catch {
          /* malformed hash */
        }
        if (anchor)
          target = {
            x: 0,
            y: anchor.getBoundingClientRect().top + window.scrollY,
          };
      }
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      if (anchor)
        target.y = Math.min(target.y, Math.max(0, height - window.innerHeight));
      const ready =
        Math.max(0, height - window.innerHeight) >= target.y &&
        (!location.hash || hasSaved || anchor);
      if (ready || performance.now() - started > 10_000) {
        window.scrollTo(target.x, target.y);
        restoring = false;
        latest = { x: window.scrollX, y: window.scrollY };
      } else {
        frame = requestAnimationFrame(restore);
      }
    }

    window.addEventListener("scroll", record, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("popstate", save);
    document.addEventListener("click", save, true);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    frame = requestAnimationFrame(restore);
    return () => {
      writeNavigationState(key, latest);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", record);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("popstate", save);
      document.removeEventListener("click", save, true);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [
    location.key,
    location.pathname,
    location.search,
    location.hash,
    navigationType,
  ]);

  return null;
}
