import { Avatar, Badge, Box, List, ListItemButton, Typography } from '@mui/material';
import type { Conversation } from '../../types/message';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps): JSX.Element {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>, id: string, index: number): void {
    if (e.key === 'Enter') {
      onSelect(id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = conversations[index + 1];
      if (next) onSelect(next.id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = conversations[index - 1];
      if (prev) onSelect(prev.id);
    }
  }

  return (
    <List
      role="list"
      aria-label="Conversations"
      disablePadding
      sx={{ width: '100%', overflow: 'auto' }}
    >
      {conversations.map((conv, index) => (
        <ListItemButton
          key={conv.id}
          selected={conv.id === selectedId}
          onClick={() => onSelect(conv.id)}
          onKeyDown={(e) => handleKeyDown(e, conv.id, index)}
          aria-selected={conv.id === selectedId}
          aria-label={`${conv.participantName}: ${conv.lastMessage}`}
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            py: 1.5,
            px: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            ...(conv.id === selectedId && { bgcolor: 'action.selected' }),
          }}
        >
          <Badge
            badgeContent={conv.unreadCount > 0 ? conv.unreadCount : undefined}
            color="primary"
            overlap="circular"
          >
            <Avatar
              sx={{ width: 40, height: 40, bgcolor: 'primary.light', fontSize: 14 }}
              aria-hidden="true"
            >
              {conv.participantAvatar}
            </Avatar>
          </Badge>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography
                variant="body2"
                fontWeight={conv.isRead ? 400 : 700}
                noWrap
                sx={{ flex: 1, mr: 1 }}
              >
                {conv.participantName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {formatRelativeTime(conv.lastMessageAt)}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              fontWeight={conv.isRead ? 400 : 600}
            >
              {conv.lastMessage}
            </Typography>
          </Box>
        </ListItemButton>
      ))}
    </List>
  );
}
