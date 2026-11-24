"use client";
/**
 * Listens for the USB barcode scanner on the whole room board page.
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
