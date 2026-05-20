import { api } from '../lib/api-client';

export type ShoppingItemStatus = 'Needed' | 'Purchased' | 'Not Available' | 'Ordered';

export interface ShoppingList {
  id: number;
  event_id: number;
  name: string;
  created_by: number | null;
  created_at: string;
}

export interface ShoppingItem {
  id: number;
  list_id: number;
  name: string;
  quantity: number;
  unit: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: ShoppingItemStatus;
  assigned_to: number | null;
  notes: string | null;
  created_at: string;
  // #800 — virtual columns from listItems JOIN; null when no expense is linked.
  synced_expense_id?: number | null;
  synced_at?: string | null;
}

export interface CreateListInput {
  name: string;
}

export interface CreateItemInput {
  name: string;
  quantity?: number;
  unit?: string;
  estimated_cost?: number;
  notes?: string;
}

export interface UpdateItemInput {
  name?: string;
  quantity?: number;
  unit?: string;
  estimated_cost?: number;
  actual_cost?: number;
  status?: ShoppingItemStatus;
  assigned_to?: number;
  notes?: string;
}

export async function listShoppingLists(eventId: number): Promise<ShoppingList[]> {
  const data = await api.get<{ lists: ShoppingList[] }>(`/api/events/${eventId}/shopping-lists`);
  return data.lists ?? [];
}

export async function createShoppingList(
  eventId: number,
  input: CreateListInput,
): Promise<ShoppingList> {
  const data = await api.post<{ list: ShoppingList }>(
    `/api/events/${eventId}/shopping-lists`,
    input,
  );
  return data.list;
}

export async function deleteShoppingList(eventId: number, listId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/shopping-lists/${listId}`);
}

export async function listShoppingItems(eventId: number, listId: number): Promise<ShoppingItem[]> {
  const data = await api.get<{ items: ShoppingItem[] }>(
    `/api/events/${eventId}/shopping-lists/${listId}/items`,
  );
  return data.items ?? [];
}

export async function createShoppingItem(
  eventId: number,
  listId: number,
  input: CreateItemInput,
): Promise<ShoppingItem> {
  const data = await api.post<{ item: ShoppingItem }>(
    `/api/events/${eventId}/shopping-lists/${listId}/items`,
    input,
  );
  return data.item;
}

export interface UpdateItemResult {
  item: ShoppingItem;
  /** Populated when an auto-sync to budget ran as part of this update (#800). */
  synced_expense_id: number | null;
  synced_at: string | null;
}

export async function updateShoppingItem(
  eventId: number,
  listId: number,
  itemId: number,
  input: UpdateItemInput,
): Promise<ShoppingItem> {
  const result = await updateShoppingItemFull(eventId, listId, itemId, input);
  return result.item;
}

export async function updateShoppingItemFull(
  eventId: number,
  listId: number,
  itemId: number,
  input: UpdateItemInput,
): Promise<UpdateItemResult> {
  const data = await api.put<UpdateItemResult>(
    `/api/events/${eventId}/shopping-lists/${listId}/items/${itemId}`,
    input,
  );
  // Patch the item with the linked expense for immediate badge rendering.
  return {
    ...data,
    item: { ...data.item, synced_expense_id: data.synced_expense_id, synced_at: data.synced_at },
  };
}

export async function deleteShoppingItem(
  eventId: number,
  listId: number,
  itemId: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/shopping-lists/${listId}/items/${itemId}`);
}

export interface SyncResult {
  expense: {
    id: number;
    event_id: number;
    category_id: number | null;
    title: string;
    amount: number;
    payment_status: string;
    notes: string | null;
    created_at: string;
  };
  synced: boolean;
  updated: boolean;
}

export async function syncItemToBudget(
  eventId: number,
  listId: number,
  itemId: number,
  categoryId?: number,
): Promise<SyncResult> {
  return api.post<SyncResult>(
    `/api/events/${eventId}/shopping-lists/${listId}/items/${itemId}/sync-to-budget`,
    categoryId !== undefined ? { category_id: categoryId } : {},
  );
}

/** Undo a recent shopping → budget sync (60s grace window) — #800. */
export async function unsyncItemFromBudget(
  eventId: number,
  listId: number,
  itemId: number,
): Promise<{ unsynced: boolean; expense_id: number }> {
  return api.delete<{ unsynced: boolean; expense_id: number }>(
    `/api/events/${eventId}/shopping-lists/${listId}/items/${itemId}/sync-to-budget`,
  );
}
