# Developer Setup Guide

## 🚀 Quick Start for New Developers

Copy and paste these commands to get the application running on your machine:

### Step 1: Pull Latest Changes

```bash
# Navigate to repository
cd ~/source/devel/eQuip/break-things-here

# Switch to develop branch and pull latest
git checkout develop
git pull origin develop

# Verify you have the latest commit
git log --oneline -1
# Should show: 32d0735 fix: add CSRF token handling and test user setup scripts
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### Step 3: Setup Test Users

```bash
# Create test user accounts in the database
cd backend
node scripts/create-test-user.mjs
cd ..
```

**Expected Output:**
```
✨ Test users ready!

Login credentials:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Admin:
  Email: admin@festival.local
  Password: festivalAdmin2025

User:
  Email: user@festival.local
  Password: userPass2025
```

### Step 4: Build and Verify

```bash
# Build frontend
npm run build

# Build backend
cd backend
npm run build
cd ..

# Run tests (optional but recommended)
npm test
```

**Expected Results:**
- ✅ Frontend build: Success
- ✅ Backend build: Success
- ✅ Tests: 336/336 passing

### Step 5: Run the Application

**Terminal 1 - Start Backend:**
```bash
cd backend
npm run dev
```

Wait for: `Festival Planner API running on port 3001`

**Terminal 2 - Start Frontend:**
```bash
npm run dev
```

Wait for: `VITE v5.4.21  ready in xxx ms`

### Step 6: Access the Application

Open your browser to: **http://localhost:5173/**

**Login with:**
- **Email:** `admin@festival.local`
- **Password:** `festivalAdmin2025`

---

## 🔍 Troubleshooting

### Issue: "Cannot connect to backend"
**Solution:**
```bash
# Check if backend is running
lsof -i :3001

# If not running, restart backend
cd backend
npm run dev
```

### Issue: "Invalid email or password"
**Solution:**
```bash
# Recreate test users
cd backend
node scripts/create-test-user.mjs
```

### Issue: "CSRF token error"
**Solution:**
1. Clear browser cookies (F12 → Application → Cookies → Clear All)
2. Refresh the page (F5)
3. Try logging in again

### Issue: Database not found
**Solution:**
```bash
# The database is auto-created on first backend start
# If issues persist, delete and recreate:
cd backend
rm -f database/dev.sqlite
npm run dev
# Database will be recreated automatically
```

### Issue: Port already in use
**Solution:**
```bash
# Kill processes using ports 3001 or 5173
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9

# Restart servers
cd backend && npm run dev  # Terminal 1
npm run dev                 # Terminal 2 (from root)
```

### Issue: Dependencies not installing
**Solution:**
```bash
# Clean install
rm -rf node_modules backend/node_modules
rm package-lock.json backend/package-lock.json
npm install
cd backend && npm install && cd ..
```

---

## 📋 Verification Checklist

After setup, verify everything works:

- [ ] ✅ Backend running on port 3001
- [ ] ✅ Frontend running on http://localhost:5173
- [ ] ✅ Can access login page
- [ ] ✅ Can login with test credentials
- [ ] ✅ Dashboard loads with navigation
- [ ] ✅ Can view events list
- [ ] ✅ No console errors in browser (F12)

---

## 📚 Additional Resources

- **Quick Start Guide:** [QUICK_START.md](QUICK_START.md)
- **Contributing Guidelines:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Branching Strategy:** [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md)
- **API Documentation:** Backend runs on `http://localhost:3001/api`

---

## 🆘 Still Having Issues?

1. Check the database has test users:
   ```bash
   cd backend
   node scripts/check-database.mjs
   ```

2. Verify password works:
   ```bash
   cd backend
   node scripts/test-password.mjs
   ```

3. Check all builds succeed:
   ```bash
   npm run build && cd backend && npm run build && cd ..
   ```

4. Run tests to verify functionality:
   ```bash
   npm test
   ```

If all above pass but you still can't login, open browser DevTools (F12) and check:
- Console for JavaScript errors
- Network tab for failed API requests
- Application tab to verify cookies are being set

---

## ✅ Success!

You should now have:
- ✅ Latest code from develop branch
- ✅ All dependencies installed
- ✅ Test users created
- ✅ Application running locally
- ✅ Able to login and use the system

**Happy coding!** 🎉
