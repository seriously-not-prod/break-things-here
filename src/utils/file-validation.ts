/** Allowed MIME types for profile photo uploads. */
export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Maximum allowed profile photo file size: 2 MB. */
export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a profile photo file against allowed types and size limits.
 * Validates by MIME type (not extension) and size.
 */
export function validateProfilePhoto(file: File): FileValidationResult {
  const allowedTypes: readonly string[] = ALLOWED_PHOTO_MIME_TYPES;

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Only JPEG, PNG, and WebP are allowed.`,
    };
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`,
    };
  }

  return { valid: true };
}
