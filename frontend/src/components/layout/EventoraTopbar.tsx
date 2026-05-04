import React, { useState } from 'react';
import './EventoraTopbar.css';

interface TopbarProps {
  searchPlaceholder?: string;
  userName?: string;
  userRole?: string;
  userAvatar?: string;
  onSearch?: (query: string) => void;
  onNotificationClick?: () => void;
  onMessageClick?: () => void;
  onAddClick?: () => void;
}

export const EventoraTopbar: React.FC<TopbarProps> = ({
  searchPlaceholder = 'Search events, guests, tasks…',
  userName = 'User',
  userRole = 'Event Planner',
  userAvatar = 'U',
  onSearch,
  onNotificationClick,
  onMessageClick,
  onAddClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearch?.(query);
  };

  return (
    <div className="topbar">
      {/* Hamburger Menu */}
      <div className="topbar-hamburger">
        <i className="fa-solid fa-bars"></i>
      </div>

      {/* Search Bar */}
      <div className="topbar-search">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={handleSearch}
        />
        <span className="topbar-kbd">Ctrl + K</span>
      </div>

      {/* Right Section */}
      <div className="topbar-right">
        {/* Add Button */}
        <button
          className="topbar-add"
          title="Add new item"
          onClick={onAddClick}
        >
          +
        </button>

        {/* Notification Bell */}
        <button
          className="topbar-icon"
          title="Notifications"
          onClick={onNotificationClick}
        >
          <i className="fa-solid fa-bell"></i>
          <div className="notif-dot"></div>
        </button>

        {/* Messages */}
        <button
          className="topbar-icon"
          title="Messages"
          onClick={onMessageClick}
        >
          <i className="fa-solid fa-message"></i>
        </button>

        {/* User Profile */}
        <div className="topbar-user">
          <div className="topbar-user-avatar">{userAvatar}</div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{userName}</div>
            <div className="topbar-user-role">{userRole}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventoraTopbar;
