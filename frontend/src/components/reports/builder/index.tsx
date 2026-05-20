/**
 * Report Builder page entry point (#812).
 *
 * Accepts an optional eventId prop. Renders a prompt if no event is selected.
 */
import React from 'react';
import { ReportBuilderForm } from './ReportBuilderForm';

interface ReportBuilderPageProps {
  eventId?: number;
}

export function ReportBuilderPage({ eventId }: ReportBuilderPageProps): React.JSX.Element {
  if (!eventId) {
    return (
      <main aria-label="Report Builder" style={{ padding: '24px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Custom Report Builder</h1>
        <p>Please select an event to build a report.</p>
      </main>
    );
  }

  return <ReportBuilderForm eventId={eventId} />;
}

export { ReportBuilderForm } from './ReportBuilderForm';
export { FieldSelector } from './FieldSelector';
export { FilterEditor } from './FilterEditor';
export type { ReportBuilderValues, ReportDomain } from './schema';
