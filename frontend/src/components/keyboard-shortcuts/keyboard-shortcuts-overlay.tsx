import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import type { ShortcutDefinition } from '../../hooks/use-keyboard-shortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutDefinition[];
}

/** Map internal key values to compact display labels */
function formatKey(key: string): string {
  const aliases: Record<string, string> = {
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ' ': 'Space',
  };
  return aliases[key] ?? key;
}

function ShortcutKeys({ keys }: { keys: ShortcutDefinition['keys'] }): JSX.Element {
  const parts = Array.isArray(keys) ? keys : [keys];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {parts.map((k, i) => (
        <Box key={`${k}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {i > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mx: 0.25 }}>
              then
            </Typography>
          )}
          <Chip
            label={formatKey(k)}
            size="small"
            variant="outlined"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '0.75rem',
              borderRadius: 1,
              height: 24,
              borderColor: 'divider',
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

/**
 * Modal dialog that lists all registered keyboard shortcuts, grouped by
 * category. Triggered by pressing `?` anywhere outside a text field.
 */
export function KeyboardShortcutsOverlay({ open, onClose, shortcuts }: Props): JSX.Element {
  // Group shortcuts by category, preserving insertion order within each group
  const grouped = shortcuts.reduce<Record<string, ShortcutDefinition[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="keyboard-shortcuts-dialog-title"
      aria-describedby="keyboard-shortcuts-dialog-desc"
      maxWidth="sm"
      fullWidth
      data-testid="keyboard-shortcuts-overlay"
    >
      <DialogTitle
        id="keyboard-shortcuts-dialog-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}
      >
        <KeyboardIcon fontSize="small" aria-hidden="true" />
        Keyboard Shortcuts
      </DialogTitle>
      <IconButton
        aria-label="close keyboard shortcuts help"
        onClick={onClose}
        size="small"
        sx={{ position: 'absolute', right: 8, top: 10 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      <DialogContent id="keyboard-shortcuts-dialog-desc" dividers>
        {categories.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No shortcuts registered.
          </Typography>
        )}

        {categories.map((cat, ci) => (
          <Box key={cat} sx={{ mb: ci < categories.length - 1 ? 3 : 0 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight={700}
              sx={{ display: 'block', mb: 1 }}
            >
              {cat}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            {grouped[cat].map((s) => (
              <Box
                key={s.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 0.75,
                }}
              >
                <Typography variant="body2">{s.label}</Typography>
                <ShortcutKeys keys={s.keys} />
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
