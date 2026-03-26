import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import path from 'path';
import fs from 'fs/promises';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role_id: number;
  };
}

export async function getUserProfile(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const db = getDatabase();

    const profile = await db.get(
      `
      SELECT up.*, u.email, u.display_name, u.email_verified
      FROM user_profiles up
      JOIN users u ON up.user_id = u.id
      WHERE up.user_id = ?
      `,
      [req.user.id],
    );

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
      });
    }

    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

export async function updateUserProfile(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const { bio, phoneNumber, dateOfBirth, address, city, state, zipCode, country } = req.body;

    const db = getDatabase();

    // Check if profile exists
    const existingProfile = await db.get('SELECT id FROM user_profiles WHERE user_id = ?', [
      req.user.id,
    ]);

    if (!existingProfile) {
      return res.status(404).json({
        error: 'Profile not found',
      });
    }

    // Update profile
    await db.run(
      `
      UPDATE user_profiles
      SET bio = ?, phone_number = ?, date_of_birth = ?,
          address = ?, city = ?, state = ?, zip_code = ?, country = ?
      WHERE user_id = ?
      `,
      [bio, phoneNumber, dateOfBirth, address, city, state, zipCode, country, req.user.id],
    );

    res.json({
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

export async function uploadProfilePhoto(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      // Clean up the uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        error: 'Only image files are allowed (JPEG, PNG, GIF, WebP)',
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        error: 'File size must not exceed 5MB',
      });
    }

    const db = getDatabase();

    // Get old photo URL if exists
    const existingProfile = await db.get(
      'SELECT profile_photo_url FROM user_profiles WHERE user_id = ?',
      [req.user.id],
    );

    // Delete old photo if exists
    if (existingProfile?.profile_photo_url) {
      try {
        const oldFilePath = path.join(process.cwd(), 'uploads', existingProfile.profile_photo_url);
        await fs.unlink(oldFilePath);
      } catch (err) {
        console.error('Failed to delete old profile photo:', err);
      }
    }

    const relativePhotoUrl = path.join('uploads', req.file.filename);

    // Update database with new photo URL
    await db.run('UPDATE user_profiles SET profile_photo_url = ? WHERE user_id = ?', [
      relativePhotoUrl,
      req.user.id,
    ]);

    res.json({
      message: 'Profile photo uploaded successfully',
      photoUrl: relativePhotoUrl,
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    res.status(500).json({ error: 'Failed to upload profile photo' });
  }
}

export async function deleteProfilePhoto(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const db = getDatabase();

    // Get photo URL
    const profile = await db.get(
      'SELECT profile_photo_url FROM user_profiles WHERE user_id = ?',
      [req.user.id],
    );

    if (!profile?.profile_photo_url) {
      return res.status(404).json({
        error: 'No profile photo found',
      });
    }

    // Delete file from disk
    try {
      const filePath = path.join(process.cwd(), profile.profile_photo_url);
      await fs.unlink(filePath);
    } catch (err) {
      console.error('Failed to delete photo file:', err);
    }

    // Update database
    await db.run('UPDATE user_profiles SET profile_photo_url = NULL WHERE user_id = ?', [
      req.user.id,
    ]);

    res.json({
      message: 'Profile photo deleted successfully',
    });
  } catch (error) {
    console.error('Delete profile photo error:', error);
    res.status(500).json({ error: 'Failed to delete profile photo' });
  }
}

export async function changeEmail(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { newEmail, password } = req.body as { newEmail?: unknown; password?: unknown };

    if (!newEmail || typeof newEmail !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'newEmail and password are required' });
    }

    const { validateEmailFormat, verifyPassword, generateVerificationToken, sendVerificationEmail } =
      await import('../utils/auth-helpers.js');

    if (!validateEmailFormat(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const db = getDatabase();

    const user = await db.get<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user.id],
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (newEmail === user.email) {
      return res.status(400).json({ error: 'New email must differ from current email' });
    }

    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Ensure new email is not already taken by another account
    const conflict = await db.get(
      'SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL',
      [newEmail, req.user.id],
    );
    if (conflict) {
      return res.status(409).json({ error: 'Email is already in use' });
    }

    const token = generateVerificationToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

    // Store PENDING email — current email remains active until confirmed
    await db.run(
      `UPDATE users
       SET pending_email = ?, pending_email_token = ?, pending_email_token_expiry = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newEmail, token, expiry, req.user.id],
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Notify old email that a change was requested
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT) || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@festival-planner.local',
        to: user.email,
        subject: 'Email change requested',
        text: `A request was made to change your email to ${newEmail}. If this wasn't you, contact support immediately.`,
      });
    } catch (err) {
      console.error('Failed to notify old email:', err);
    }

    // Send confirmation link to the NEW email
    try {
      await sendVerificationEmail(newEmail, token, baseUrl);
    } catch (err) {
      console.error('Failed to send confirmation email to new address:', err);
    }

    return res.status(200).json({
      message: 'Confirmation sent to your new email address. Your current email remains active until confirmed.',
    });
  } catch (error) {
    console.error('Change email error:', error);
    return res.status(500).json({ error: 'Failed to initiate email change' });
  }
}

/**
 * POST /api/profile/confirm-email-change
 * Confirms a pending email change via token.
 */
export async function confirmEmailChange(req: AuthRequest, res: Response) {
  try {
    const { token } = req.body as { token?: unknown };

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const db = getDatabase();

    const user = await db.get<{
      id: number;
      pending_email: string;
      pending_email_token_expiry: string;
    }>(
      `SELECT id, pending_email, pending_email_token_expiry
       FROM users
       WHERE pending_email_token = ? AND deleted_at IS NULL`,
      [token],
    );

    if (!user || !user.pending_email) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (new Date(user.pending_email_token_expiry) < new Date()) {
      return res.status(400).json({ error: 'Token has expired. Please request a new email change.' });
    }

    await db.run(
      `UPDATE users
       SET email = pending_email,
           pending_email = NULL,
           pending_email_token = NULL,
           pending_email_token_expiry = NULL,
           email_verified = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [user.id],
    );

    return res.status(200).json({ message: 'Email address updated successfully.' });
  } catch (error) {
    console.error('Confirm email change error:', error);
    return res.status(500).json({ error: 'Failed to confirm email change' });
  }
}

export async function deleteAccount(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { password } = req.body as { password?: unknown };

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required to confirm account deletion' });
    }

    const db = getDatabase();
    const user = await db.get<{ password_hash: string; profile_photo_url?: string }>(
      `SELECT u.password_hash, up.profile_photo_url
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [req.user.id],
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { verifyPassword } = await import('../utils/auth-helpers.js');
    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Remove profile photo from disk
    if (user.profile_photo_url) {
      try {
        await fs.unlink(path.join(process.cwd(), user.profile_photo_url));
      } catch { /* file may already be gone */ }
    }

    // Anonymise personal data and soft-delete — issue #39
    await db.run(
      `UPDATE users
       SET deleted_at = CURRENT_TIMESTAMP,
           email = 'deleted-' || id || '@deleted.invalid',
           display_name = 'Deleted User',
           password_hash = '',
           email_verification_token = NULL,
           pending_email = NULL,
           pending_email_token = NULL,
           pending_email_token_expiry = NULL
       WHERE id = ?`,
      [req.user.id],
    );

    await db.run(
      `UPDATE user_profiles
       SET bio = NULL, phone_number = NULL, profile_photo_url = NULL,
           address = NULL, city = NULL, state = NULL, zip_code = NULL, country = NULL
       WHERE user_id = ?`,
      [req.user.id],
    );

    // Invalidate all sessions
    await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);

    res.clearCookie('refreshToken');

    // 204 No Content — issue #39
    return res.status(204).send();
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
}

