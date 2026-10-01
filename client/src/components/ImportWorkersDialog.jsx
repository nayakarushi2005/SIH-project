import { useId, useState } from 'react';
import { CircleCheck, Loader2, Upload } from 'lucide-react';
import useFetchWithAuth from '../hooks/useFetchWithAuth';
import { Button, Modal, Notice, buttonClass } from './ui';
import { WORKER_MESSAGES } from '../utils/workerFields';
import { readWorkerSheet, rowProblem } from '../utils/workerSheet';

const REQUIRED_HEADINGS = ['Name', 'Mobile Number', 'Aadhaar Number'];
const IMPORT_FAILED = 'Could not import the workers. Try again.';
const NETWORK_FAILED = 'Could not reach the server. Check your connection and try again.';

const readJson = (res) => res.json().catch(() => ({}));
const countOf = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function RowList({ label, rows }) {
  return (
    <ul
      tabIndex={0}
      aria-label={label}
      className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md text-sm text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {rows.map(({ row, message }) => (
        <li key={row}>
          <span className="font-medium text-ink">Row {row}:</span> {message}
        </li>
      ))}
    </ul>
  );
}

export default function ImportWorkersDialog({ onClose, onImported }) {
  const authFetch = useFetchWithAuth();
  const inputId = useId();

  const [stage, setStage] = useState('choose');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const busy = stage === 'reading' || stage === 'importing';
  const readyCount = sheet ? sheet.valid.length : 0;

  const requestClose = () => {
    if (!busy) onClose();
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setSheet(null);
    setError(null);
    setStage('reading');
    const outcome = await readWorkerSheet(file);
    if (outcome.error) {
      setError(outcome.error);
      setStage('choose');
      return;
    }
    setSheet(outcome);
    setStage('ready');
  };

  const runImport = async () => {
    if (readyCount === 0) return;
    setStage('importing');
    setError(null);
    try {
      const res = await authFetch('/api/federation/me/workers/import', {
        method: 'POST',
        body: JSON.stringify({ rows: sheet.valid }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data.message || IMPORT_FAILED);
        setStage('ready');
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      setResult({
        added: typeof data.added === 'number' ? data.added : results.filter((r) => r.status === 'added').length,
        skipped: results
          .filter((r) => r.status !== 'added')
          .map((r) => ({ row: r.row, message: rowProblem(r.errors || {}) || WORKER_MESSAGES.duplicate })),
      });
      setStage('done');
      onImported();
    } catch {
      setError(NETWORK_FAILED);
      setStage('ready');
    }
  };

  const footer =
    stage === 'done' ? (
      <Button onClick={onClose} autoFocus>
        Done
      </Button>
    ) : (
      <>
        <Button variant="secondary" onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={runImport} disabled={stage !== 'ready' || readyCount === 0}>
          {stage === 'importing' ? 'Importing…' : `Import ${countOf(readyCount, 'worker')}`}
        </Button>
      </>
    );

  return (
    <Modal open onClose={requestClose} title="Import workers from Excel" footer={footer}>
      {stage === 'done' && result ? (
        <div className="space-y-4">
          <Notice tone="ok" icon={CircleCheck}>
            Added {countOf(result.added, 'worker')}.
          </Notice>
          {result.skipped.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink">
                {countOf(result.skipped.length, 'row')} {result.skipped.length === 1 ? 'was' : 'were'} skipped
              </p>
              <RowList label="Skipped rows" rows={result.skipped} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 text-sm text-ink-2">
          <p>Put one worker on each row. The first row must hold these column headings:</p>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_HEADINGS.map((heading) => (
              <span key={heading} className="rounded border border-line bg-canvas px-2 py-1 text-xs font-medium text-ink">
                {heading}
              </span>
            ))}
            <span className="rounded border border-dashed border-line-strong px-2 py-1 text-xs text-ink-2">
              Photo (optional)
            </span>
          </div>
          <p>
            The optional Photo column can hold a link to the worker&apos;s photo. Only the last 4 digits of each Aadhaar
            number are saved. Only Excel workbooks (.xlsx) can be read.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              id={inputId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={chooseFile}
              disabled={busy}
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              className={`${buttonClass('secondary')} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
            >
              <Upload className="w-4 h-4" />
              {fileName ? 'Choose another file' : 'Choose Excel file'}
            </label>
            {fileName && <span className="min-w-0 max-w-full truncate text-ink-3">{fileName}</span>}
          </div>

          {stage === 'reading' && (
            <p className="flex items-center gap-2 text-ink-3" role="status">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading the sheet
            </p>
          )}

          {error && <Notice>{error}</Notice>}

          {sheet && (
            <div className="rounded-md border border-line">
              <p className="flex items-center gap-2 px-4 py-3 font-medium text-ink" role="status">
                <CircleCheck className="w-4 h-4 shrink-0 text-ok" />
                {countOf(readyCount, 'worker')} ready to import
              </p>
              {sheet.problems.length > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <p className="font-medium text-warn">
                    {countOf(sheet.problems.length, 'row')} with problems will be skipped
                  </p>
                  <RowList label="Rows with problems" rows={sheet.problems} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
