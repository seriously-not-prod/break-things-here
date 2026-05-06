module.exports = {
  apps: [
    {
      name: 'equip-backend',
      cwd: './backend',
      script: 'npx',
      args: 'tsx src/index.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:123@localhost:5432/festival_planner',
        PORT: '4000',
        JWT_SECRET: 'festival-planner-dev-jwt-secret-change-in-production',
        JWT_EXPIRES_IN: '1h',
        SESSION_TIMEOUT_MS: '1800000',
        TOKEN_HASH_SECRET: 'festival-planner-token-hash-secret-dev',
        REFRESH_TOKEN_ENC_KEY: 'ZmVzdGl2YWwtcGxhbm5lci1kZXYtcmVmcmVzaC1rZXk=',
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
