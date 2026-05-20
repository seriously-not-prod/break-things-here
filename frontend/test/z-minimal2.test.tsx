import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../src/services/guest-service');

import { CheckInPage } from '../src/components/checkin/checkin-page';

describe('z-minimal2', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/events/1/checkin']}>
        <Routes>
          <Route path="/events/:id/checkin" element={<CheckInPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
