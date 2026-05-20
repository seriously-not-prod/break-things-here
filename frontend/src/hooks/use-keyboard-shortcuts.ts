import { useEffect, useRef } from 'react';

export interface ShortcutDefinition {
  /** Unique identifier used for deduplication in registries */
  id: string;
  /**
   * Single key (e.g. `'?'`, `'Escape'`) or a two-key chord tuple
   * (e.g. `['g', 'd']`). Values follow `KeyboardEvent.key` convention.
   */
  keys: string | [string, string];
  /** Human-readable description shown in the help overlay */
  label: string;
  /** Category heading shown in the help overlay  */
  category: string;
  action: () => void;
}

/**
 * Returns true when keyboard focus is inside a text-capture element.
 * Shortcuts must not fire in these contexts.
 */
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Register keyboard shortcuts with automatic cleanup on unmount.
 *
 * - Single-key shortcuts fire immediately on that key.
 * - Chord shortcuts (two-key sequences like g→d) wait up to 1 second for
 *   the second key after the first is pressed.
 * - All shortcuts are silenced when focus is inside a text-entry element
 *   (`<input>`, `<textarea>`, `<select>`, or `[contenteditable]`).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]): void {
  // Keep a ref so the handler always sees the latest shortcuts array
  // without needing to re-subscribe the event listener on every render.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const pendingChordKey = useRef<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearChord(): void {
      pendingChordKey.current = null;
      if (chordTimer.current !== null) {
        clearTimeout(chordTimer.current);
        chordTimer.current = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      // Never intercept shortcuts when the user is typing in a field.
      if (isEditableTarget(document.activeElement)) return;

      const key = e.key;

      // ── Resolve second key of a pending chord ────────────────────────────
      if (pendingChordKey.current !== null) {
        const firstKey = pendingChordKey.current;
        clearChord();
        const match = shortcutsRef.current.find(
          (s) => Array.isArray(s.keys) && s.keys[0] === firstKey && s.keys[1] === key,
        );
        if (match) {
          e.preventDefault();
          match.action();
        }
        return;
      }

      // ── Check single-key shortcuts ────────────────────────────────────────
      const singleMatch = shortcutsRef.current.find(
        (s) => typeof s.keys === 'string' && s.keys === key,
      );
      if (singleMatch) {
        e.preventDefault();
        singleMatch.action();
        return;
      }

      // ── Check if this key starts a chord ─────────────────────────────────
      const startsChord = shortcutsRef.current.some(
        (s) => Array.isArray(s.keys) && s.keys[0] === key,
      );
      if (startsChord) {
        e.preventDefault();
        pendingChordKey.current = key;
        // Auto-cancel the pending chord after 1 second of inactivity.
        chordTimer.current = setTimeout(clearChord, 1000);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearChord();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable – shortcuts accessed through ref
}
