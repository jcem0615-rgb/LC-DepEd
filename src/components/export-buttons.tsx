'use client';

import { useCallback, useRef, useState } from 'react';
import { downloadPdf, downloadXlsx } from '@/lib/export';
import type { PdfSpec, WorkbookSpec } from '@/lib/export-spec';
import { Icon } from './icons';

type Phase = 'idle' | 'working' | 'done' | 'fallback';

function useTransientPhase() {
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((next: Phase) => {
    setPhase(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase('idle'), 3500);
  }, []);
  return { phase, setPhase, flash };
}

/**
 * Downloads a real .xlsx workbook, falling back to CSV on this device when the
 * export service cannot be reached (for example in the middle of a class with
 * no signal).
 */
export function XlsxButton({
  build,
  label = 'Export XLSX',
  className = 'btn btn-sm btn-secondary',
  disabled,
  onResult,
}: {
  build: () => WorkbookSpec | Promise<WorkbookSpec>;
  label?: string;
  className?: string;
  disabled?: boolean;
  onResult?: (outcome: 'xlsx' | 'csv') => void;
}) {
  const { phase, setPhase, flash } = useTransientPhase();

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || phase === 'working'}
      onClick={async () => {
        setPhase('working');
        const outcome = await downloadXlsx(await build());
        flash(outcome === 'xlsx' ? 'done' : 'fallback');
        onResult?.(outcome);
      }}
      title={
        phase === 'fallback'
          ? 'No connection to the export service — a CSV was saved from this device instead.'
          : undefined
      }
    >
      <Icon name="download" className="h-4 w-4" />
      {phase === 'working'
        ? 'Building…'
        : phase === 'done'
          ? 'Saved .xlsx ✓'
          : phase === 'fallback'
            ? 'Offline — CSV saved'
            : label}
    </button>
  );
}

/**
 * Downloads a server-rendered PDF, falling back to the browser print dialog
 * (scoped to `fallbackElementId`) when offline.
 */
export function PdfButton({
  build,
  fallbackElementId,
  label = 'Download PDF',
  className = 'btn btn-sm btn-secondary',
  disabled,
  onResult,
}: {
  build: () => PdfSpec | Promise<PdfSpec>;
  fallbackElementId?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  onResult?: (outcome: 'pdf' | 'print') => void;
}) {
  const { phase, setPhase, flash } = useTransientPhase();

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || phase === 'working'}
      onClick={async () => {
        setPhase('working');
        const outcome = await downloadPdf(await build(), fallbackElementId);
        flash(outcome === 'pdf' ? 'done' : 'fallback');
        onResult?.(outcome);
      }}
      title={
        phase === 'fallback'
          ? 'No connection to the export service — the print dialog was opened instead.'
          : undefined
      }
    >
      <Icon name="document" className="h-4 w-4" />
      {phase === 'working'
        ? 'Preparing…'
        : phase === 'done'
          ? 'Saved .pdf ✓'
          : phase === 'fallback'
            ? 'Offline — printing'
            : label}
    </button>
  );
}
