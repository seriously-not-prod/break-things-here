import express from 'express';
import { createRegisterRouter } from './api/auth/register';

/**
 * Creates and configures the Express application.
 * Exported without listening to allow supertest integration testing.
 */
export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.use('/api/auth', createRegisterRouter());

  return app;
}
