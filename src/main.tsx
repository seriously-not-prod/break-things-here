import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventPlannerApp } from './components/event-planner/event-planner-app';
import { runStorageDiagnostic } from './utils/storage-diagnostic';

// Run storage diagnostic on app load (especially helpful for Chrome debugging)
runStorageDiagnostic();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EventPlannerApp />
  </StrictMode>
);
