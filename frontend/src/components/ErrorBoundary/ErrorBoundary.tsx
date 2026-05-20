import React, { Component, ErrorInfo } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  resetKey: number;
}

/**
 * React Error Boundary — wraps route segments to prevent white-screen crashes (#675).
 * Catches errors thrown during render, in lifecycle methods, and in constructors
 * of the descendant component tree. Does NOT catch errors in event handlers,
 * async code, or server-side rendering — those need try/catch at the call site.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error', error, info.componentStack);
  }

  handleReset = (): void => {
    // Bump resetKey so children remount fresh rather than reusing the failed subtree.
    this.setState((prev) => ({ hasError: false, error: undefined, resetKey: prev.resetKey + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px" p={3}>
          <Paper elevation={2} sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom aria-live="assertive" role="alert">
              Something went wrong
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              An unexpected error occurred. Please try again, or refresh the page if the problem
              persists.
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
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
