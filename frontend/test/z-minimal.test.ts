import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/services/guest-service');
describe('z-minimal', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
