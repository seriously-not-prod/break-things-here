/**
 * FilterEditor — add/remove filter rows for the report builder (#812).
 */
import React from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { FILTER_OPERATORS } from './schema';
import type { ReportBuilderValues } from './schema';

interface FieldMeta {
  key: string;
  label: string;
  filterable: boolean;
}

interface FilterEditorProps {
  filterableFields: FieldMeta[];
}

const NULL_OPERATORS = new Set(['is_null', 'is_not_null']);

export function FilterEditor({ filterableFields }: FilterEditorProps): React.JSX.Element {
  const { register, watch } = useFormContext<ReportBuilderValues>();
  const { fields, append, remove } = useFieldArray<ReportBuilderValues, 'filters'>({
    name: 'filters',
  });

  const watchedFilters = watch('filters');

  return (
    <section aria-labelledby="filters-heading">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h3 id="filters-heading" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
          Filters
        </h3>
        <button
          type="button"
          onClick={() => append({ field: filterableFields[0]?.key ?? '', operator: '=', value: '' })}
          aria-label="Add filter"
          style={{ fontSize: '0.8rem', cursor: 'pointer', padding: '2px 10px', borderRadius: '4px' }}
        >
          + Add filter
        </button>
      </div>

      {fields.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No filters applied.</p>
      )}

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {fields.map((field, index) => {
          const operator = watchedFilters?.[index]?.operator;
          const needsValue = !NULL_OPERATORS.has(operator ?? '');

          return (
            <li key={field.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {/* Field */}
              <select
                {...register(`filters.${index}.field`)}
                aria-label={`Filter ${index + 1} field`}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
              >
                {filterableFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>

              {/* Operator */}
              <select
                {...register(`filters.${index}.operator`)}
                aria-label={`Filter ${index + 1} operator`}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
              >
                {FILTER_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>

              {/* Value (hidden for is_null / is_not_null) */}
              {needsValue && (
                <input
                  {...register(`filters.${index}.value`)}
                  type="text"
                  aria-label={`Filter ${index + 1} value`}
                  placeholder="value"
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', minWidth: '120px' }}
                />
              )}

              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove filter ${index + 1}`}
                style={{ padding: '2px 8px', cursor: 'pointer', color: '#dc2626', background: 'none', border: 'none', fontSize: '1.1rem' }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
