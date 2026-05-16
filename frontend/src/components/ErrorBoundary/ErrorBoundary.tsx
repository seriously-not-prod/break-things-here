import React, { Component, ErrorInfo } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React Error Boundary — wraps route segments to prevent white-screen crashes (#675).
 * Catches render-phase and event-handler errors thrown by child components.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to structured output; swap for error monitoring service in production
    console.error('[ErrorBoundary] Caught render error', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="200px"
          p={3}
        >
          <Paper elevation={2} sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom aria-live="assertive" role="alert">
              Something went wrong
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              {this.state.error?.message ?? 'An unexpected error occurred. Please try again.'}
            </Typography>
            <Button
              variant="contained"
              onClick={this.handleReset}
              aria-label="Retry loading this section"
            >
              Try Again
            </Button>
          </Paper>
        </Box>
      );
    }
    return this.props.children;
  }
}
