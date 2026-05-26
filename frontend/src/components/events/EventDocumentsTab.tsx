import { ChangeEvent, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { api, apiFetch, getAuthHeaders } from '../../lib/api-client';

interface EventDocument {
  id: number;
  event_id: number;
  original_name: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface EventDocumentsTabProps {
  eventId: string;
  documents: EventDocument[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function EventDocumentsTab({
  eventId,
  documents,
  canEdit,
  onRefresh,
  onError,
}: EventDocumentsTabProps): JSX.Element {
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  async function uploadDocument(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentUploading(true);
    setDocumentError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const res = await apiFetch(`/api/events/${eventId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? res.statusText);
      }

      await onRefresh();
      if (documentInputRef.current) documentInputRef.current.value = '';
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setDocumentUploading(false);
    }
  }

  async function downloadDocument(doc: EventDocument): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/events/${eventId}/documents/${doc.id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? res.statusText);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = window.document.createElement('a');
        link.href = objectUrl;
        link.download = doc.original_name;
        link.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Document download failed.');
    }
  }

  async function deleteDocument(documentId: number): Promise<void> {
    if (!window.confirm('Delete this document?')) return;
    await api
      .delete(`/api/events/${eventId}/documents/${documentId}`)
      .catch((err) => onError(err.message));
    await onRefresh();
  }

  return (
    <>
      {canEdit && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <Button variant="contained" component="label">
            {documentUploading ? 'Uploading…' : 'Upload Document'}
            <input
              ref={documentInputRef}
              hidden
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={uploadDocument}
            />
          </Button>
          <Typography variant="caption" color="text.secondary">
            PDF, JPEG, PNG, WebP · max 5 MB
          </Typography>
        </Stack>
      )}
      {documentError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {documentError}
        </Alert>
      )}
      {documents.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No documents yet.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell>
                  <strong>Type</strong>
                </TableCell>
                <TableCell>
                  <strong>Size</strong>
                </TableCell>
                <TableCell>
                  <strong>Uploaded</strong>
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <strong>Actions</strong>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} hover>
                  <TableCell>{doc.original_name}</TableCell>
                  <TableCell>{doc.mime_type}</TableCell>
                  <TableCell>{Math.ceil(doc.file_size / 1024)} KB</TableCell>
                  <TableCell>{new Date(doc.created_at).toLocaleString()}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" onClick={() => downloadDocument(doc)}>
                          Download
                        </Button>
                        <Button size="small" color="error" onClick={() => deleteDocument(doc.id)}>
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
