import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, type ShortcutDefinition } from '../src/hooks/use-keyboard-shortcuts';
import { KeyboardShortcutsOverlay } from '../src/components/keyboard-shortcuts/keyboard-shortcuts-overlay';
import { ThemeProvider, createTheme } from '@mui/material';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEvent(key: string, target?: EventTarget): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, target } as KeyboardEventInit);
}

function fireKey(key: string): void {
  fireEvent.keyDown(document, { key });
}

function renderOverlay(open: boolean, shortcuts: ShortcutDefinition[], onClose = vi.fn()) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <KeyboardShortcutsOverlay open={open} onClose={onClose} shortcuts={shortcuts} />
    </ThemeProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests: useKeyboardShortcuts hook (AC1 + AC3)
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  describe('AC1 – core shortcuts are implemented', () => {
    it('fires action on single-key shortcut', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      fireKey('?');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action on chord shortcut (g → d)', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-dash',
            keys: ['g', 'd'],
            label: 'Dashboard',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('d');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action on chord shortcut (g → e)', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-events',
            keys: ['g', 'e'],
            label: 'Events',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('e');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action on chord shortcut (g → m)', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-messages',
            keys: ['g', 'm'],
            label: 'Messages',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('m');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action on chord shortcut (g → p)', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-profile',
            keys: ['g', 'p'],
            label: 'Profile',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('p');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action on chord shortcut (g → c)', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-calendar',
            keys: ['g', 'c'],
            label: 'Calendar',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('c');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('fires action for Escape shortcut', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'close', keys: 'Escape', label: 'Close', category: 'Global', action },
        ]),
      );

      fireKey('Escape');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('does not fire action for unregistered key', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      fireKey('x');
      fireKey('z');
      expect(action).not.toHaveBeenCalled();
    });

    it('does not fire chord action when second key does not match', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-dash',
            keys: ['g', 'd'],
            label: 'Dashboard',
            category: 'Navigation',
            action,
          },
        ]),
      );

      fireKey('g');
      fireKey('x'); // wrong second key
      expect(action).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AC3 – shortcuts do NOT fire inside editable elements
  // -------------------------------------------------------------------------

  describe('AC3 – shortcuts do not interfere with standard input behavior', () => {
    let input: HTMLInputElement;
    let textarea: HTMLTextAreaElement;
    let select: HTMLSelectElement;

    beforeEach(() => {
      input = document.createElement('input');
      textarea = document.createElement('textarea');
      select = document.createElement('select');
      document.body.appendChild(input);
      document.body.appendChild(textarea);
      document.body.appendChild(select);
    });

    afterEach(() => {
      document.body.removeChild(input);
      document.body.removeChild(textarea);
      document.body.removeChild(select);
    });

    it('does not fire when focus is in <input>', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      input.focus();
      fireEvent.keyDown(document, { key: '?' });
      expect(action).not.toHaveBeenCalled();
    });

    it('does not fire when focus is in <textarea>', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      textarea.focus();
      fireEvent.keyDown(document, { key: '?' });
      expect(action).not.toHaveBeenCalled();
    });

    it('does not fire when focus is in <select>', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      select.focus();
      fireEvent.keyDown(document, { key: '?' });
      expect(action).not.toHaveBeenCalled();
    });

    it('does not fire chord first key when focus is in <input>', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'nav-dash',
            keys: ['g', 'd'],
            label: 'Dashboard',
            category: 'Navigation',
            action,
          },
        ]),
      );

      input.focus();
      fireEvent.keyDown(document, { key: 'g' });
      // blur and fire second key from global context
      input.blur();
      fireEvent.keyDown(document, { key: 'd' });
      // The chord was never started so action should not fire
      expect(action).not.toHaveBeenCalled();
    });

    it('does fire action after focus leaves editable element', () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      input.focus();
      // fire while focused – should NOT fire
      fireEvent.keyDown(document, { key: '?' });
      expect(action).not.toHaveBeenCalled();

      // blur and fire again – SHOULD fire now
      input.blur();
      fireEvent.keyDown(document, { key: '?' });
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Hook cleanup
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('removes the keydown listener when the component unmounts', () => {
      const action = vi.fn();
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts([
          { id: 'help', keys: '?', label: 'Help', category: 'Global', action },
        ]),
      );

      unmount();
      fireKey('?');
      expect(action).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: KeyboardShortcutsOverlay component (AC2)
// ---------------------------------------------------------------------------

describe('KeyboardShortcutsOverlay', () => {
  const sampleShortcuts: ShortcutDefinition[] = [
    {
      id: 'help-toggle',
      keys: '?',
      label: 'Show / hide this help overlay',
      category: 'Global',
      action: vi.fn(),
    },
    {
      id: 'nav-dashboard',
      keys: ['g', 'd'],
      label: 'Go to Dashboard',
      category: 'Navigation',
      action: vi.fn(),
    },
    {
      id: 'nav-events',
      keys: ['g', 'e'],
      label: 'Go to Events',
      category: 'Navigation',
      action: vi.fn(),
    },
    {
      id: 'nav-messages',
      keys: ['g', 'm'],
      label: 'Go to Messages',
      category: 'Navigation',
      action: vi.fn(),
    },
    {
      id: 'nav-profile',
      keys: ['g', 'p'],
      label: 'Go to Profile',
      category: 'Navigation',
      action: vi.fn(),
    },
    {
      id: 'nav-calendar',
      keys: ['g', 'c'],
      label: 'Go to Calendar',
      category: 'Navigation',
      action: vi.fn(),
    },
  ];

  describe('AC2 – help overlay documents shortcuts', () => {
    it('renders the overlay when open=true', () => {
      renderOverlay(true, sampleShortcuts);
      expect(screen.getByTestId('keyboard-shortcuts-overlay')).toBeTruthy();
      expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    });

    it('does not render the dialog content when open=false', () => {
      renderOverlay(false, sampleShortcuts);
      expect(screen.queryByTestId('keyboard-shortcuts-overlay')).toBeFalsy();
    });

    it('displays all registered shortcut labels', () => {
      renderOverlay(true, sampleShortcuts);
      expect(screen.getByText('Show / hide this help overlay')).toBeTruthy();
      expect(screen.getByText('Go to Dashboard')).toBeTruthy();
      expect(screen.getByText('Go to Events')).toBeTruthy();
      expect(screen.getByText('Go to Messages')).toBeTruthy();
      expect(screen.getByText('Go to Profile')).toBeTruthy();
      expect(screen.getByText('Go to Calendar')).toBeTruthy();
    });

    it('groups shortcuts by category', () => {
      renderOverlay(true, sampleShortcuts);
      // Category headings rendered in overline style (uppercase in the DOM)
      expect(screen.getByText(/global/i)).toBeTruthy();
      expect(screen.getByText(/navigation/i)).toBeTruthy();
    });

    it('displays key chips for single-key shortcuts', () => {
      renderOverlay(true, sampleShortcuts);
      // The "?" shortcut key chip should be visible
      expect(screen.getByText('?')).toBeTruthy();
    });

    it('displays "then" label between chord keys', () => {
      renderOverlay(true, sampleShortcuts);
      const thenLabels = screen.getAllByText('then');
      expect(thenLabels.length).toBeGreaterThan(0);
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      renderOverlay(true, sampleShortcuts, onClose);
      const closeBtn = screen.getByLabelText('close keyboard shortcuts help');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('has accessible dialog title and description', () => {
      renderOverlay(true, sampleShortcuts);
      expect(document.getElementById('keyboard-shortcuts-dialog-title')).toBeTruthy();
      expect(document.getElementById('keyboard-shortcuts-dialog-desc')).toBeTruthy();
    });

    it('shows empty state when no shortcuts are registered', () => {
      renderOverlay(true, []);
      expect(screen.getByText('No shortcuts registered.')).toBeTruthy();
    });
  });

  describe('integration – pressing ? opens overlay via hook', () => {
    it('triggers the help-toggle action via single-key shortcut', () => {
      const toggleAction = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          {
            id: 'help-toggle',
            keys: '?',
            label: 'Show / hide this help overlay',
            category: 'Global',
            action: toggleAction,
          },
        ]),
      );

      fireKey('?');
      expect(toggleAction).toHaveBeenCalledTimes(1);
    });
  });
});
