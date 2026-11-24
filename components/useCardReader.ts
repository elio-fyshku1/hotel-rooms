"use client";
/**
 * Listens for a USB card reader (NFC/RFID) or barcode scanner on the whole page.
 *
 * These devices work as a keyboard: when a card is presented they "type" its
 * code very quickly and press Enter. A person types much slower, so keys that
 * arrive more than MAX_KEY_GAP_MS apart start a new code. This way the worker
 * doesn't have to click into a text field before presenting a card.
 *
 * Keys typed while a text field is focused are left alone, so forms keep
 * working normally (the scan field on the board has its own submit).
 */
import { useEffect, useRef } from "react";

const MAX_KEY_GAP_MS = 60;
const MIN_CODE_LENGTH = 4;

export function useCardReader(onCode: (code: string) => void): void {
  // Keep the latest callback in a ref so the key listener is attached only once
  const callbackRef = useRef(onCode);
  callbackRef.current = onCode;

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;

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

      // Enter (or Tab, depending on the reader's setting) ends the code
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
