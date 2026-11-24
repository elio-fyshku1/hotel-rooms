"use client";
/**
 * Browser hooks used by the room board.
 */
import { useEffect, useRef } from "react";

// A barcode scanner sends a character every few milliseconds; a person typing
// is much slower. Keys further apart than this start a new code.
const MAX_KEY_GAP_MS = 60;

// Shorter input is ignored (stray key presses, not a card code)
const MIN_CODE_LENGTH = 4;

/**
 * Listens for the USB barcode scanner on the whole page.
 *
 * The scanner works as a keyboard: it "types" the card code very quickly and
 * presses Enter. Collecting fast keystrokes here means the worker doesn't have
 * to click into a text field before scanning.
 *
 * Keys typed while a text field is focused are left alone, so forms keep
 * working normally (the scan field on the board has its own submit).
 */
export function useCardReader(onCode: (code: string) => void): void {
  // Keep the latest callback in a ref so the key listener is attached only once
  const callbackRef = useRef(onCode);
  callbackRef.current = onCode;

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;

    // Called for every key press on the page
    function handleKeyDown(event: KeyboardEvent) {
      // Don't interfere with typing in inputs, selects and text areas
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
        return;
      }

      // A long pause means this key starts a new code
      const now = performance.now();
      if (now - lastKeyTime > MAX_KEY_GAP_MS) buffer = "";
      lastKeyTime = now;

      // Enter (or Tab, depending on the scanner's setting) ends the code
      if (event.key === "Enter" || event.key === "Tab") {
        if (buffer.length >= MIN_CODE_LENGTH) {
          event.preventDefault();
          callbackRef.current(buffer);
        }
        buffer = "";
        return;
      }

      // Collect printable characters only (skip Shift, arrows, etc.)
      if (event.key.length === 1) buffer += event.key;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

// The Screen Wake Lock API is not in every TypeScript DOM version yet, so the
// small part we use is described here.
interface WakeLockSentinel {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
}

/**
 * Keeps the screen from turning off while the room board is open, so the
 * reception PC/tablet always shows the current state of the rooms.
 *
 * The browser releases the lock whenever the tab is hidden, so it is requested
 * again each time the tab becomes visible. Works in Chrome, Edge and Safari
 * 16.4+, over HTTPS or on localhost; elsewhere it does nothing.
 */
export function useWakeLock(): void {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;

    // Ask for the lock (only possible while the page is visible)
    async function requestLock() {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
      if (!wakeLock || document.visibilityState !== "visible") return;
      try {
        sentinel = await wakeLock.request("screen");
      } catch {
        // Refused (e.g. battery saver). The board works the same without it.
      }
    }

    // Re-acquire after switching back to this tab
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestLock();
    }

    requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Release the lock when the board is closed
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sentinel?.release().catch(() => undefined);
    };
  }, []);
}
