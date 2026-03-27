import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RegistrationForm } from './components/registration-form';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RegistrationForm />
  </StrictMode>
);
