import React, { useEffect, useRef, useState } from 'react';
import {
  listChatMessages,
  postChatMessage,
  editChatMessage,
  deleteChatMessage,
  type ChatMessage,
} from '../../services/event-chat-service';

interface EventChatPanelProps {
  eventId: number;
  currentUserId: number;
}

export function EventChatPanel({ eventId, currentUserId }: EventChatPanelProps): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listChatMessages(eventId)
      .then((msgs) => { if (!cancelled) { setMessages(msgs); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const msg = await postChatMessage(eventId, trimmed, replyTo?.id);
      setMessages((prev) => [...prev, msg]);
      setBody('');
      setReplyTo(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (id: number) => {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    try {
      const updated = await editChatMessage(eventId, id, trimmed);
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
      setEditBody('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await deleteChatMessage(eventId, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading chat…</div>;

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden" aria-label="Event team chat">
      {/* Header */}
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
        <span className="font-semibold text-sm">Team Chat</span>
        <span className="text-xs text-muted-foreground">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" role="log" aria-live="polite">
        {error && (
          <div className="text-red-600 text-sm p-2 rounded bg-red-50 border border-red-200" role="alert">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-8">No messages yet. Start the conversation!</div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.user_id === currentUserId;
          return (
            <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-muted-foreground">{msg.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.edited_at && <span className="text-xs text-muted-foreground italic">(edited)</span>}
              </div>
              {msg.reply_to_id && msg.reply_to_body && (
                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded mb-1 max-w-xs truncate border-l-2 border-primary/40">
                  <span className="font-medium">{msg.reply_to_author}:</span> {msg.reply_to_body}
                </div>
              )}
              {editingId === msg.id ? (
                <div className="flex gap-2 max-w-sm w-full">
                  <input
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    aria-label="Edit message"
                  />
                  <button
                    className="px-2 py-1 text-xs bg-primary text-white rounded"
                    onClick={() => handleEdit(msg.id)}
                  >
                    Save
                  </button>
                  <button className="px-2 py-1 text-xs border rounded" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div
                  className={`px-3 py-2 rounded-lg text-sm max-w-sm whitespace-pre-wrap break-words ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {msg.body}
                </div>
              )}
              {isOwn && editingId !== msg.id && (
                <div className="flex gap-2 mt-0.5">
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => { setReplyTo(msg); }}
                    aria-label="Reply"
                  >
                    Reply
                  </button>
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => { setEditingId(msg.id); setEditBody(msg.body); }}
                    aria-label="Edit"
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => handleDelete(msg.id)}
                    aria-label="Delete"
                  >
                    Delete
                  </button>
                </div>
              )}
              {!isOwn && editingId !== msg.id && (
                <button
                  className="text-xs text-muted-foreground hover:underline mt-0.5"
                  onClick={() => setReplyTo(msg)}
                  aria-label="Reply"
                >
                  Reply
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="px-4 py-1 bg-muted/40 border-t flex items-center gap-2 text-xs text-muted-foreground">
          <span>Replying to <strong>{replyTo.author_name}</strong>: {replyTo.body.slice(0, 60)}…</span>
          <button className="ml-auto text-red-500 hover:underline" onClick={() => setReplyTo(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Compose */}
      <div className="px-4 py-3 border-t bg-background flex gap-2">
        <textarea
          className="flex-1 border rounded px-3 py-2 text-sm resize-none"
          rows={2}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Chat message input"
          maxLength={4000}
          disabled={sending}
        />
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
          onClick={handleSend}
          disabled={!body.trim() || sending}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}
