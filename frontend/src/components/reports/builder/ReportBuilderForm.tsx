/**
 * ReportBuilderForm — main form component for the custom report builder (#812).
 *
 * Uses React Hook Form + Zod validation.
 * Communicates with:
 *   GET  /api/reports/builder/domains              — load domain metadata
 *   POST /api/events/:eventId/reports/builder/run  — run now
 *   POST /api/events/:eventId/reports/builder/save — save / schedule
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { reportBuilderSchema, REPORT_DOMAINS, OUTPUT_FORMATS, FREQUENCIES } from './schema';
import type { ReportBuilderValues, ReportDomain } from './schema';
import { FieldSelector } from './FieldSelector';
import { FilterEditor } from './FilterEditor';
import { api } from '../../../lib/api-client';

interface FieldMeta {
  key: string;
  label: string;
  filterable: boolean;
}

interface DomainMeta {
  domain: ReportDomain;
  fields: FieldMeta[];
}

interface ReportBuilderFormProps {
  eventId: number;
}

export function ReportBuilderForm({ eventId }: ReportBuilderFormProps): React.JSX.Element {
  const [domainMeta, setDomainMeta] = useState<DomainMeta[]>([]);
  const [runResult, setRunResult] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const methods = useForm<ReportBuilderValues>({
    resolver: zodResolver(reportBuilderSchema),
    defaultValues: {
      name: '',
      domain: 'guests',
      fields: [],
      filters: [],
      format: 'json',
      frequency: 'one_off',
      recipients: [],
    },
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = methods;

  const selectedDomain = watch('domain');
  const selectedFormat = watch('format');
  const selectedFrequency = watch('frequency');

  // Load domain metadata once
  useEffect(() => {
    api
      .get<{ domains: DomainMeta[] }>('/api/reports/builder/domains')
      .then((data) => setDomainMeta(data.domains))
      .catch(() => setStatusMsg('Failed to load domain metadata.'));
  }, []);

  // Reset fields when domain changes
  useEffect(() => {
    setValue('fields', []);
    setValue('filters', []);
    setValue('groupBy', undefined);
    setValue('sort', undefined);
  }, [selectedDomain, setValue]);

  const currentDomain = domainMeta.find((d) => d.domain === selectedDomain);
  const filterableFields = (currentDomain?.fields ?? []).filter((f) => f.filterable);

  const handleRun = useCallback(
    handleSubmit(async (values) => {
      setIsRunning(true);
      setStatusMsg('');
      setRunResult(null);
      try {
        if (values.format === 'csv' || values.format === 'xlsx') {
          // Trigger file download
          const res = await fetch(`/api/events/${eventId}/reports/builder/run`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
            setStatusMsg(`Error: ${err.error}`);
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `report-${values.domain}.${values.format}`;
          a.click();
          URL.revokeObjectURL(url);
          setStatusMsg('Download started.');
        } else {
          const data = await api.post<{ columns: string[]; rows: Record<string, unknown>[] }>(
            `/api/events/${eventId}/reports/builder/run`,
            values,
          );
          setRunResult(data);
          setStatusMsg(`${data.rows.length} row(s) returned.`);
        }
      } catch (err) {
        setStatusMsg(err instanceof Error ? err.message : 'Run failed.');
      } finally {
        setIsRunning(false);
      }
    }),
    [handleSubmit, eventId],
  );

  const handleSave = useCallback(
    handleSubmit(async (values) => {
      setIsSaving(true);
      setStatusMsg('');
      try {
        await api.post(`/api/events/${eventId}/reports/builder/save`, values);
        setStatusMsg('Report saved successfully.');
      } catch (err) {
        setStatusMsg(err instanceof Error ? err.message : 'Save failed.');
      } finally {
        setIsSaving(false);
      }
    }),
    [handleSubmit, eventId],
  );

  return (
    <FormProvider {...methods}>
      <main aria-labelledby="builder-heading" style={{ maxWidth: '900px', padding: '24px' }}>
        <h1 id="builder-heading" style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>
          Custom Report Builder
        </h1>

        <form noValidate>
          {/* Report name */}
          <section aria-labelledby="name-heading" style={{ marginBottom: '20px' }}>
            <label htmlFor="report-name" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
              Report Name <span aria-hidden="true" style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              id="report-name"
              type="text"
              {...register('name')}
              aria-required="true"
              aria-describedby={errors.name ? 'name-error' : undefined}
              placeholder="e.g. Guest RSVP Status Report"
              style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: `1px solid ${errors.name ? '#dc2626' : '#d1d5db'}` }}
            />
            {errors.name && (
              <p id="name-error" role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '4px' }}>
                {errors.name.message}
              </p>
            )}
          </section>

          {/* Domain selector */}
          <section aria-labelledby="domain-heading" style={{ marginBottom: '20px' }}>
            <label htmlFor="report-domain" id="domain-heading" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
              Domain <span aria-hidden="true" style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              id="report-domain"
              {...register('domain')}
              aria-required="true"
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db', minWidth: '200px' }}
            >
              {REPORT_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
            {errors.domain && (
              <p role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '4px' }}>
                {errors.domain.message}
              </p>
            )}
          </section>

          {/* Field selector */}
          {currentDomain && (
            <section style={{ marginBottom: '20px' }}>
              <FieldSelector
                fields={currentDomain.fields}
                selected={watch('fields')}
                onChange={(f) => setValue('fields', f, { shouldValidate: true })}
                error={errors.fields?.message}
              />
            </section>
          )}

          {/* Filters */}
          {filterableFields.length > 0 && (
            <section style={{ marginBottom: '20px' }}>
              <FilterEditor filterableFields={filterableFields} />
            </section>
          )}

          {/* Group by */}
          {currentDomain && currentDomain.domain !== 'budget' && (
            <section aria-labelledby="groupby-heading" style={{ marginBottom: '20px' }}>
              <label htmlFor="report-groupby" id="groupby-heading" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                Group By
              </label>
              <select
                id="report-groupby"
                {...register('groupBy')}
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db', minWidth: '180px' }}
              >
                <option value="">— none —</option>
                {currentDomain.fields.filter((f) => f.filterable).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </section>
          )}

          {/* Sort */}
          {currentDomain && (
            <section aria-labelledby="sort-heading" style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label htmlFor="sort-field" id="sort-heading" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                  Sort By
                </label>
                <select
                  id="sort-field"
                  {...register('sort.field')}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db', minWidth: '160px' }}
                >
                  <option value="">— none —</option>
                  {currentDomain.fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sort-dir" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                  Direction
                </label>
                <select
                  id="sort-dir"
                  {...register('sort.direction')}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </section>
          )}

          {/* Output format */}
          <section aria-labelledby="format-heading" style={{ marginBottom: '20px' }}>
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend id="format-heading" style={{ fontWeight: 600, marginBottom: '6px' }}>Output Format</legend>
              <div style={{ display: 'flex', gap: '16px' }}>
                {OUTPUT_FORMATS.map((fmt) => (
                  <label key={fmt} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" value={fmt} {...register('format')} />
                    {fmt.toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          {/* Save options */}
          <section aria-labelledby="schedule-heading" style={{ marginBottom: '24px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <h2 id="schedule-heading" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
              Save / Schedule
            </h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label htmlFor="frequency" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>
                  Frequency
                </label>
                <select
                  id="frequency"
                  {...register('frequency')}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f === 'one_off' ? 'One-off (no schedule)' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFrequency !== 'one_off' && (
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <label htmlFor="recipients" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>
                    Recipients (comma-separated emails)
                  </label>
                  <input
                    id="recipients"
                    type="text"
                    placeholder="alice@example.com, bob@example.com"
                    onBlur={(e) => {
                      const emails = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setValue('recipients', emails, { shouldValidate: true });
                    }}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }} role="group" aria-label="Report actions">
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              aria-busy={isRunning}
              style={{ padding: '8px 20px', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              {isRunning ? 'Running…' : selectedFormat === 'json' ? 'Run Now' : `Download ${selectedFormat.toUpperCase()}`}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              aria-busy={isSaving}
              style={{ padding: '8px 20px', borderRadius: '6px', background: '#059669', color: '#fff', border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Status message */}
          {statusMsg && (
            <p
              role="status"
              aria-live="polite"
              style={{ marginTop: '12px', fontSize: '0.9rem', color: statusMsg.startsWith('Error') ? '#dc2626' : '#059669' }}
            >
              {statusMsg}
            </p>
          )}
        </form>

        {/* Inline results table (JSON format) */}
        {runResult && runResult.rows.length > 0 && (
          <section aria-labelledby="results-heading" style={{ marginTop: '32px', overflowX: 'auto' }}>
            <h2 id="results-heading" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
              Results ({runResult.rows.length} rows)
            </h2>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
              aria-label="Report results"
            >
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {runResult.columns.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runResult.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                        {val == null ? '' : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </FormProvider>
  );
}
