import express from 'express';
import { createRegisterRouter } from './api/auth/register';
import { createConfirmEmailRouter } from './api/auth/confirmEmail';
import { createLoginRouter } from './api/auth/login';
import { createPasswordResetRouter } from './api/auth/password-reset';

/**
 * Creates and configures the Express application.
 * Exported without listening to allow supertest integration testing.
 */
export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.use('/api/auth', createRegisterRouter());
  app.use('/api/auth', createConfirmEmailRouter());
  app.use('/api/auth', createLoginRouter());
  app.use('/api/auth', createPasswordResetRouter());

  return app;
}
