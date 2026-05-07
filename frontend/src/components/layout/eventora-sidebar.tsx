import type { FC } from 'react';
import './eventora-sidebar.css';

interface SidebarProps {
  activeNav?: string;
  userName?: string;
  userRole?: string;
  userAvatar?: string;
}

export const EventoraSidebar: FC<SidebarProps> = ({
  activeNav = 'dashboard',
  userName = 'User',
  userRole = 'Event Planner',
  userAvatar = 'U',
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-grid-2' },
    { id: 'events', label: 'Events', icon: 'fa-calendar-days', badge: '12' },
    { id: 'guests', label: 'Guests', icon: 'fa-users' },
    { id: 'tasks', label: 'Tasks', icon: 'fa-list-check' },
    { id: 'budget', label: 'Budget', icon: 'fa-wallet' },
    { id: 'vendors', label: 'Vendors', icon: 'fa-store' },
    { id: 'timeline', label: 'Timeline', icon: 'fa-timeline' },
    { id: 'gallery', label: 'Gallery', icon: 'fa-images' },
    { id: 'reports', label: 'Reports', icon: 'fa-chart-bar' },
    { id: 'notifications', label: 'Notifications', icon: 'fa-bell', badge: '3' },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <i className="fa-solid fa-calendar-star"></i>
        </div>
        <div>
          <div className="logo-text">Eventora</div>
          <div className="logo-sub">Plan. Organize. Celebrate.</div>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input type="text" placeholder="Search..." />
      </div>

      {/* Navigation */}
      <div className="sidebar-section">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
          >
            <i className={`fa-solid ${item.icon}`}></i>
            <span>{item.label}</span>
            {item.badge && <span className="nav-badge">{item.badge}</span>}
          </a>
        ))}
      </div>

      {/* Divider */}
      <div className="sidebar-divider"></div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <div className="quick-label">Quick Actions</div>
        <div className="qa-btn primary-btn">
          <div className="qa-icon">
            <i className="fa-solid fa-plus"></i>
          </div>
          Create Event
        </div>
        <div className="qa-btn">
          <div className="qa-icon">
            <i className="fa-solid fa-user-plus"></i>
          </div>
          Add Guest
        </div>
        <div className="qa-btn">
          <div className="qa-icon">
            <i className="fa-solid fa-circle-plus"></i>
          </div>
          Create Task
        </div>
        <div className="qa-btn">
          <div className="qa-icon">
            <i className="fa-solid fa-receipt"></i>
          </div>
          Add Expense
        </div>
        <div className="qa-btn">
          <div className="qa-icon">
            <i className="fa-solid fa-envelope"></i>
          </div>
          Send Invitation
        </div>
      </div>

      {/* Upgrade Box */}
      <div className="upgrade-box">
        <div className="crown">👑</div>
        <p>Upgrade to Pro<br /><small>Unlock advanced features</small></p>
        <button>Upgrade Now</button>
      </div>

      {/* User Profile */}
      <div className="sidebar-user">
        <div className="user-avatar-sm">{userAvatar}</div>
        <div>
          <div className="user-name-sm">{userName}</div>
          <div className="user-role-sm">{userRole}</div>
        </div>
        <div className="user-chevron">
          <i className="fa-solid fa-chevron-up"></i>
        </div>
      </div>
    </aside>
  );
};

export default EventoraSidebar;
