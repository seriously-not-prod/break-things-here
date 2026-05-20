import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Box, Button } from '@mui/material';
import { CheckCircleOutlineRounded } from '@mui/icons-material';

describe('z-minimal3', () => {
  it('renders MUI icons', () => {
    const { container } = render(
      <Box>
        <Button>Hi</Button>
        <CheckCircleOutlineRounded />
      </Box>,
    );
    expect(container).toBeTruthy();
  });
});
