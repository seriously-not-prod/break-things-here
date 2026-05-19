// PM2 process definition. Secrets MUST come from the environment (.env
// loaded by your shell, your secrets manager, or `pm2 start --update-env`).
// Do NOT inline credentials here — this file is committed.
//
// Required variables (see .env.example): DATABASE_URL, JWT_SECRET,
// TOKEN_HASH_SECRET, REFRESH_TOKEN_ENC_KEY. The backend refuses to start in
// production when any of these are missing, so PM2 will surface the failure.

module.exports = {
  apps: [
    {
      name: 'equip-backend',
      cwd: './backend',
      script: 'npx',
      args: 'tsx src/index.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || '4000',
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
        SESSION_TIMEOUT_MS: process.env.SESSION_TIMEOUT_MS || '1800000',
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
    },
    {
      name: 'equip-frontend',
      cwd: './frontend',
      script: 'npx',
      args: 'vite preview --port 3000',
      interpreter: 'none',
      autorestart: true,
      watch: false,
    },
  ],
};
