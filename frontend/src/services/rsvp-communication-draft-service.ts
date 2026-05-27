/**
 * RSVP Communication Draft Service
 * Issue: #951 — RSVP Communication Drafting Assistance
 */

import { api } from '../lib/api-client';

export type RsvpDraftTone = 'formal' | 'friendly' | 'casual' | 'urgent';
export type RsvpDraftLength = 'short' | 'medium' | 'long';

export interface RsvpCommunicationDraft {
  reminderVariant: string;
  confirmationVariant: string;
  deadlineReminder: string;
}

export interface RsvpCommunicationDraftResponse {
  entityId: number;
  tone: RsvpDraftTone;
  draftLength: RsvpDraftLength;
  drafts: RsvpCommunicationDraft;
  raw: string;
}

export interface RsvpCommunicationDraftRequest {
  entityId: number;
  tone: RsvpDraftTone;
  draftLength: RsvpDraftLength;
  prompt?: string;
}

export async function generateRsvpCommunicationDraft(
  params: RsvpCommunicationDraftRequest,
): Promise<RsvpCommunicationDraftResponse> {
  return api.post<RsvpCommunicationDraftResponse>('/api/ai/rsvp-draft', params);
}
