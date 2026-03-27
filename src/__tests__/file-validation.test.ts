import {
  validateProfilePhoto,
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_SIZE_BYTES,
} from '../utils/file-validation';

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Array(sizeBytes).fill('a').join('');
  return new File([content], name, { type });
}

describe('validateProfilePhoto', () => {
  it.each(ALLOWED_PHOTO_MIME_TYPES)('accepts %s files', (mime) => {
    const file = makeFile('photo', mime, 1024);
    expect(validateProfilePhoto(file)).toEqual({ valid: true });
  });

  it('rejects GIF files', () => {
    const file = makeFile('photo.gif', 'image/gif', 1024);
    const result = validateProfilePhoto(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid file type/i);
  });

  it('rejects PDF files', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    const result = validateProfilePhoto(file);
    expect(result.valid).toBe(false);
  });

  it('rejects files larger than 2 MB', () => {
    const file = makeFile('large.jpg', 'image/jpeg', MAX_PHOTO_SIZE_BYTES + 1);
    const result = validateProfilePhoto(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it('accepts a file exactly at the 2 MB limit', () => {
    const file = makeFile('exact.png', 'image/png', MAX_PHOTO_SIZE_BYTES);
    expect(validateProfilePhoto(file)).toEqual({ valid: true });
  });
});
