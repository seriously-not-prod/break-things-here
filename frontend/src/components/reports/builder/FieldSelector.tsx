/**
 * FieldSelector — multi-select checkbox list for report fields (#812).
 */
import React from 'react';

interface FieldMeta {
  key: string;
  label: string;
  filterable: boolean;
}

interface FieldSelectorProps {
  fields: FieldMeta[];
  selected: string[];
  onChange: (selected: string[]) => void;
  error?: string;
}

export function FieldSelector({
  fields,
  selected,
  onChange,
  error,
}: FieldSelectorProps): React.JSX.Element {
  const selectedSet = new Set(selected);

  const toggle = (key: string): void => {
    const next = selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange(next);
  };

  const toggleAll = (): void => {
    onChange(selectedSet.size === fields.length ? [] : fields.map((f) => f.key));
  };

  return (
    <fieldset aria-label="Report fields" style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: '8px' }}>
        Fields{' '}
        <button
          type="button"
          onClick={toggleAll}
          aria-label={
            selectedSet.size === fields.length ? 'Deselect all fields' : 'Select all fields'
          }
          style={{
            fontSize: '0.75rem',
            marginLeft: '8px',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            color: '#2563eb',
            textDecoration: 'underline',
          }}
        >
          {selectedSet.size === fields.length ? 'Deselect all' : 'Select all'}
        </button>
      </legend>

      {error && (
        <p role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '6px' }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '6px',
        }}
        role="group"
      >
        {fields.map((field) => (
          <label
            key={field.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(field.key)}
              onChange={() => toggle(field.key)}
              aria-label={field.label}
            />
            {field.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
