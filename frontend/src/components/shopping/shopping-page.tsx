import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SyncAltRounded from '@mui/icons-material/SyncAltRounded';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type CreateItemInput,
  type CreateListInput,
  type ShoppingItem,
  type ShoppingList,
  createShoppingItem,
  createShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  listShoppingItems,
  listShoppingLists,
  syncItemToBudget,
  unsyncItemFromBudget,
  updateShoppingItemFull,
} from '../../services/shopping-service';

interface ListWithItems {
  list: ShoppingList;
  items: ShoppingItem[];
  loadingItems: boolean;
}

const emptyItemForm: CreateItemInput = {
  name: '',
  quantity: 1,
  unit: '',
  estimated_cost: undefined,
  notes: '',
};

export default function ShoppingPage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);
  const navigate = useNavigate();

  const [data, setData] = useState<ListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addListOpen, setAddListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [listFormError, setListFormError] = useState<string | null>(null);

  const [addItemListId, setAddItemListId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<CreateItemInput>(emptyItemForm);
  const [savingItem, setSavingItem] = useState(false);
  const [itemFormError, setItemFormError] = useState<string | null>(null);

  const [deleteListTarget, setDeleteListTarget] = useState<ShoppingList | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [syncingItemId, setSyncingItemId] = useState<number | null>(null);
  const [undoInfo, setUndoInfo] = useState<{
    listId: number;
    itemId: number;
    itemName: string;
  } | null>(null);
  const [syncSnackbar, setSyncSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    void loadAll();
  }, [eventId]);

  async function loadAll(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const lists = await listShoppingLists(eventId);
      const withItems = await Promise.all(
        lists.map(async (list) => {
          const items = await listShoppingItems(eventId, list.id);
          return { list, items, loadingItems: false };
        }),
      );
      setData(withItems);
    } catch {
      setError('Failed to load shopping lists.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddList(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newListName.trim()) {
      setListFormError('List name is required.');
      return;
    }
    setSavingList(true);
    setListFormError(null);
    try {
      const input: CreateListInput = { name: newListName.trim() };
      const created = await createShoppingList(eventId, input);
      setData((prev) => [...prev, { list: created, items: [], loadingItems: false }]);
      setAddListOpen(false);
      setNewListName('');
    } catch (err) {
      setListFormError(err instanceof Error ? err.message : 'Failed to create list.');
    } finally {
      setSavingList(false);
    }
  }

  async function handleDeleteList(): Promise<void> {
    if (!deleteListTarget) return;
    setDeleting(true);
    try {
      await deleteShoppingList(eventId, deleteListTarget.id);
      setData((prev) => prev.filter((d) => d.list.id !== deleteListTarget.id));
      setDeleteListTarget(null);
    } catch {
      setError('Failed to delete list.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSyncToBudget(listId: number, item: ShoppingItem): Promise<void> {
    setSyncingItemId(item.id);
    try {
      const result = await syncItemToBudget(eventId, listId, item.id);
      const msg = result.updated
        ? `Updated budget expense for "${item.name}" ($${Number(result.expense.amount).toFixed(2)}).`
        : `Synced "${item.name}" to budget as a $${Number(result.expense.amount).toFixed(2)} expense.`;
      setSyncSnackbar({ open: true, message: msg, severity: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync to budget.';
      setSyncSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSyncingItemId(null);
    }
  }

  async function handleTogglePurchased(listId: number, item: ShoppingItem): Promise<void> {
    const newStatus = item.status === 'Purchased' ? 'Needed' : 'Purchased';
    try {
      const result = await updateShoppingItemFull(eventId, listId, item.id, { status: newStatus });
      const updated = result.item;
      setData((prev) =>
        prev.map((d) =>
          d.list.id === listId
            ? { ...d, items: d.items.map((i) => (i.id === updated.id ? updated : i)) }
            : d,
        ),
      );
      if (result.synced_expense_id && newStatus === 'Purchased') {
        setUndoInfo({ listId, itemId: item.id, itemName: item.name });
        setSyncSnackbar({
          open: true,
          message: `"${item.name}" auto-synced to budget. Undo within 60s.`,
          severity: 'success',
        });
      }
    } catch {
      setError('Failed to update item status.');
    }
  }

  async function handleUndoSync(): Promise<void> {
    if (!undoInfo) return;
    const { listId, itemId, itemName } = undoInfo;
    try {
      await unsyncItemFromBudget(eventId, listId, itemId);
      setData((prev) =>
        prev.map((d) =>
          d.list.id === listId
            ? {
                ...d,
                items: d.items.map((i) =>
                  i.id === itemId ? { ...i, synced_expense_id: null, synced_at: null } : i,
                ),
              }
            : d,
        ),
      );
      setSyncSnackbar({
        open: true,
        message: `Reverted "${itemName}" — expense removed from budget.`,
        severity: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Undo failed.';
      setSyncSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setUndoInfo(null);
    }
  }

  function handleItemTextField(field: keyof CreateItemInput) {
    return (e: ChangeEvent<HTMLInputElement>): void => {
      setItemForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleAddItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!addItemListId) return;
    if (!itemForm.name.trim()) {
      setItemFormError('Item name is required.');
      return;
    }
    setSavingItem(true);
    setItemFormError(null);
    try {
      const payload: CreateItemInput = {
        name: itemForm.name.trim(),
        quantity: itemForm.quantity ? Number(itemForm.quantity) : 1,
        unit: itemForm.unit ?? undefined,
        estimated_cost:
          itemForm.estimated_cost !== undefined && itemForm.estimated_cost !== ('' as unknown)
            ? Number(itemForm.estimated_cost)
            : undefined,
        notes: itemForm.notes ?? undefined,
      };
      const created = await createShoppingItem(eventId, addItemListId, payload);
      setData((prev) =>
        prev.map((d) => (d.list.id === addItemListId ? { ...d, items: [...d.items, created] } : d)),
      );
      setAddItemListId(null);
      setItemForm(emptyItemForm);
    } catch (err) {
      setItemFormError(err instanceof Error ? err.message : 'Failed to add item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteItem(listId: number, item: ShoppingItem): Promise<void> {
    try {
      await deleteShoppingItem(eventId, listId, item.id);
      setData((prev) =>
        prev.map((d) =>
          d.list.id === listId ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
        ),
      );
    } catch {
      setError('Failed to delete item.');
    }
  }

  function computeSummary(items: ShoppingItem[]): {
    totalEst: number;
    totalActual: number;
    remaining: number;
  } {
    return items.reduce(
      (acc, item) => ({
        totalEst: acc.totalEst + (Number(item.estimated_cost) || 0) * item.quantity,
        totalActual: acc.totalActual + (Number(item.actual_cost) || 0) * item.quantity,
        remaining: acc.remaining + (item.status !== 'Purchased' ? 1 : 0),
      }),
      { totalEst: 0, totalActual: 0, remaining: 0 },
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
        <IconButton onClick={() => navigate(`/events/${eventId}`)} aria-label="Back to event">
          <ArrowBackRounded />
        </IconButton>
        <Typography variant="h5" component="h1">
          Shopping Lists
        </Typography>
        <Box flex={1} />
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAddListOpen(true)}>
          Add List
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : data.length === 0 ? (
        <Typography color="text.secondary">
          No shopping lists yet. Add one to get started.
        </Typography>
      ) : (
        data.map(({ list, items }) => {
          const { totalEst, totalActual, remaining } = computeSummary(items);
          return (
            <Accordion key={list.id} defaultExpanded variant="outlined" sx={{ mb: 1 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreRounded />}
                aria-controls={`list-${list.id}-content`}
                id={`list-${list.id}-header`}
              >
                <Stack direction="row" alignItems="center" spacing={1} width="100%" pr={1}>
                  <Typography fontWeight="medium">{list.name}</Typography>
                  <Box flex={1} />
                  <Typography variant="caption" color="text.secondary">
                    {items.length} item{items.length !== 1 ? 's' : ''} · {remaining} remaining
                  </Typography>
                  <Tooltip title="Delete list">
                    <IconButton
                      size="small"
                      aria-label={`Delete list ${list.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteListTarget(list);
                      }}
                    >
                      <DeleteRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <TableContainer>
                  <Table size="small" aria-label={`Items in ${list.name}`}>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell>Unit</TableCell>
                        <TableCell align="right">Est. Cost</TableCell>
                        <TableCell align="right">Actual</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow
                          key={item.id}
                          sx={{ opacity: item.status === 'Purchased' ? 0.5 : 1 }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={item.status === 'Purchased'}
                              onChange={() => void handleTogglePurchased(list.id, item)}
                              inputProps={{ 'aria-label': `Mark ${item.name} as purchased` }}
                              sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                            />
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Typography
                                variant="body2"
                                sx={{
                                  textDecoration:
                                    item.status === 'Purchased' ? 'line-through' : 'none',
                                }}
                              >
                                {item.name}
                              </Typography>
                              {item.synced_expense_id ? (
                                <Tooltip
                                  title={`Linked to budget expense #${item.synced_expense_id}`}
                                >
                                  <Chip
                                    label="Synced to budget"
                                    color="success"
                                    size="small"
                                    variant="outlined"
                                    data-testid={`shopping-synced-badge-${item.id}`}
                                  />
                                </Tooltip>
                              ) : null}
                            </Stack>
                            {item.notes && (
                              <Typography variant="caption" color="text.secondary">
                                {item.notes}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{item.quantity}</TableCell>
                          <TableCell>{item.unit ?? '—'}</TableCell>
                          <TableCell align="right">
                            {item.estimated_cost !== null
                              ? `$${Number(item.estimated_cost).toFixed(2)}`
                              : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {item.actual_cost !== null
                              ? `$${Number(item.actual_cost).toFixed(2)}`
                              : '—'}
                          </TableCell>
                          <TableCell align="right" padding="none" sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip
                              title={
                                item.status !== 'Purchased'
                                  ? 'Mark as Purchased to sync'
                                  : !(item.actual_cost ?? item.estimated_cost)
                                    ? 'Set a cost before syncing'
                                    : 'Sync cost to budget'
                              }
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`Sync ${item.name} to budget`}
                                  disabled={
                                    item.status !== 'Purchased' ||
                                    !(item.actual_cost ?? item.estimated_cost) ||
                                    syncingItemId === item.id
                                  }
                                  onClick={() => void handleSyncToBudget(list.id, item)}
                                >
                                  {syncingItemId === item.id ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    <SyncAltRounded fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <IconButton
                              size="small"
                              aria-label={`Delete ${item.name}`}
                              onClick={() => void handleDeleteItem(list.id, item)}
                            >
                              <DeleteRounded fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Divider />
                {/* Summary footer */}
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  p={2}
                  alignItems="center"
                >
                  <Typography variant="body2">
                    <strong>Est. Total:</strong> ${totalEst.toFixed(2)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Actual Total:</strong> ${totalActual.toFixed(2)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Remaining:</strong> {remaining}
                  </Typography>
                  <Box flex={1} />
                  <Button
                    size="small"
                    startIcon={<AddRounded />}
                    onClick={() => {
                      setAddItemListId(list.id);
                      setItemForm(emptyItemForm);
                      setItemFormError(null);
                    }}
                  >
                    Add Item
                  </Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}

      {/* Add List Dialog */}
      <Dialog open={addListOpen} onClose={() => setAddListOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddList} noValidate>
          <DialogTitle>New Shopping List</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              {listFormError && <Alert severity="error">{listFormError}</Alert>}
              <TextField
                label="List Name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                required
                autoFocus
                inputProps={{ 'aria-required': 'true' }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddListOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingList}>
              {savingList ? <CircularProgress size={20} /> : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog
        open={addItemListId !== null}
        onClose={() => setAddItemListId(null)}
        maxWidth="xs"
        fullWidth
      >
        <form onSubmit={handleAddItem} noValidate>
          <DialogTitle>Add Item</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              {itemFormError && <Alert severity="error">{itemFormError}</Alert>}
              <TextField
                label="Item Name"
                value={itemForm.name}
                onChange={handleItemTextField('name')}
                required
                autoFocus
                inputProps={{ 'aria-required': 'true' }}
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Quantity"
                  type="number"
                  value={itemForm.quantity ?? 1}
                  onChange={handleItemTextField('quantity')}
                  inputProps={{ min: 1, step: 1 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Unit"
                  value={itemForm.unit ?? ''}
                  onChange={handleItemTextField('unit')}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label="Estimated Cost ($)"
                type="number"
                value={itemForm.estimated_cost ?? ''}
                onChange={handleItemTextField('estimated_cost')}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <TextField
                label="Notes"
                multiline
                minRows={2}
                value={itemForm.notes ?? ''}
                onChange={handleItemTextField('notes')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddItemListId(null)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingItem}>
              {savingItem ? <CircularProgress size={20} /> : 'Add'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete List Confirmation */}
      <Dialog open={deleteListTarget !== null} onClose={() => setDeleteListTarget(null)}>
        <DialogTitle>Delete List</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteListTarget?.name}</strong> and all its items? This cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteListTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteList} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sync feedback — includes the 60s Undo path (#800) */}
      <Snackbar
        open={syncSnackbar.open}
        autoHideDuration={undoInfo ? 60_000 : 4000}
        onClose={() => {
          setSyncSnackbar((prev) => ({ ...prev, open: false }));
          setUndoInfo(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        data-testid="shopping-sync-snackbar"
      >
        <Alert
          severity={syncSnackbar.severity}
          onClose={() => {
            setSyncSnackbar((prev) => ({ ...prev, open: false }));
            setUndoInfo(null);
          }}
          sx={{ width: '100%' }}
          action={
            undoInfo ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => void handleUndoSync()}
                data-testid="shopping-undo-sync"
              >
                UNDO
              </Button>
            ) : undefined
          }
        >
          {syncSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
