"use client";
/**
 * Keeps the screen from turning off while the room board is open, so the
 * reception tablet/PC always shows the current state of the rooms.
 *
 * Uses the Screen Wake Lock API (Chrome, Edge, Safari 16.4+). The browser
 * releases the lock when the tab is hidden, so it is requested again when
 * the tab becomes visible. Needs HTTPS (or localhost); fails silently otherwise.
 */
import { useEffect } from "react";

interface WakeLockSentinel {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
}

export function useWakeLock(): void {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;

    async function requestLock() {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
      if (!wakeLock || document.visibilityState !== "visible") return;
      try {
        sentinel = await wakeLock.request("screen");
      } catch {
        // Not allowed (e.g. battery saver) - the board still works without it
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestLock();
    }

    requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sentinel?.release().catch(() => undefined);
    };
  }, []);
}
