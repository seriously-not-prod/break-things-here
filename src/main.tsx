import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventPlannerApp } from './components/event-planner/event-planner-app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EventPlannerApp />
  </StrictMode>
);
