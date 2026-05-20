/**
 * GlobalCommandPalette — app-level Ctrl+K / Cmd+K command palette.
 *
 * NFR §5.3 requirement: "Keyboard shortcuts — Ctrl+K command palette (global, all pages)"
 *
 * This component mounts once at the root of the app and responds to the
 * Ctrl+K / Cmd+K shortcut from any page, not just the events page.
 * It renders the existing PowerUserSearch dialog which already provides
 * fuzzy search across events, guests, tasks, vendors, etc.
 */
import { useEffect, useState } from 'react';
import PowerUserSearch from '../events/power-user-search';
import { useUiStore } from '../../stores/ui-store';

export function GlobalCommandPalette(): JSX.Element {
  const { commandPaletteOpen, openCommandPalette, closeCommandPalette } = useUiStore();
  // Local fallback state in case Zustand isn't fully hydrated yet
  const [localOpen, setLocalOpen] = useState(false);

  const isOpen = commandPaletteOpen || localOpen;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeCommandPalette();
          setLocalOpen(false);
        } else {
          openCommandPalette();
          setLocalOpen(true);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        closeCommandPalette();
        setLocalOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, openCommandPalette, closeCommandPalette]);

  return (
    <PowerUserSearch
      open={isOpen}
      onClose={() => {
        closeCommandPalette();
        setLocalOpen(false);
      }}
    />
  );
}
