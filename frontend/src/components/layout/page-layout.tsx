import type { ReactNode } from 'react';
import { Box, Breadcrumbs, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: number | string;
  noPadding?: boolean;
}

export function PageLayout({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
  maxWidth = 1400,
  noPadding = false,
}: PageLayoutProps): JSX.Element {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* ── Page Header ── */}
      <Box
        component="header"
        sx={(theme) => ({
          bgcolor: 'background.paper',
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: { xs: 2, sm: 3, md: 4 },
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          minHeight: 60,
          flexShrink: 0,
        })}
      >
        <Box>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs
              separator={<NavigateNextRoundedIcon sx={{ fontSize: 14 }} />}
              aria-label="breadcrumb"
              sx={{ mb: 0.25, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}
            >
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return isLast || !crumb.to ? (
                  <Typography
                    key={crumb.label}
                    variant="caption"
                    sx={{
                      fontWeight: isLast ? 600 : 400,
                      color: isLast ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {crumb.label}
                  </Typography>
                ) : (
                  <Link
                    key={crumb.label}
                    component={RouterLink}
                    to={crumb.to}
                    underline="hover"
                    sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                  >
                    {crumb.label}
                  </Link>
                );
              })}
            </Breadcrumbs>
          )}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h1" fontWeight={700}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{actions}</Box>
        )}
      </Box>

      {/* ── Page Content ── */}
      <Box
        sx={{
          flex: 1,
          px: noPadding ? 0 : { xs: 2, sm: 3, md: 4 },
          py: noPadding ? 0 : 3,
          maxWidth: noPadding ? undefined : maxWidth,
          width: '100%',
          mx: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default PageLayout;
