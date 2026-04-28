import express from 'express';
import { createRegisterRouter } from './api/auth/register';
import { createConfirmEmailRouter } from './api/auth/confirmEmail';

export function createApp() {
  const app = express();
  app.use(express.json());

  // Mount auth routes under /api/auth
  app.use('/api/auth', createRegisterRouter());
  app.use('/api/auth', createConfirmEmailRouter());

  return app;
}

export default createApp;
