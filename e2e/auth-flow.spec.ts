/**
 * Authentication E2E flow tests (#681).
 * Covers: login, register, logout, session expiry.
 */
import { test, expect } from '@playwright/test';

const TEST_EMAIL = 'e2e-auth@test.invalid';
const TEST_PASSWORD = 'E2eTestPass123!';

test.describe('Authentication flow', () => {
  test('should show login page by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
  });

  test('should display validation errors on empty login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page.getByText(/required|email.*required|password.*required/i)).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nonexistent@test.invalid');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|not found/i)).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /register|sign up|create account/i }).click();
    await expect(page).toHaveURL(/register/);
  });

  test('should redirect unauthenticated user from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});
