import { useEffect, useId, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import useFetchWithAuth from '../hooks/useFetchWithAuth';
import { Button, INPUT, LABEL, Modal, Notice, buttonClass } from './ui';
import { WORKER_MESSAGES, checkWorkerFields } from '../utils/workerFields';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_FILE_MESSAGE = 'Choose a JPG, PNG or WebP photo under 10 MB.';
const UPLOAD_FAILED = 'Could not upload the photo. Check your connection and try again.';
const NETWORK_FAILED = 'Could not reach the server. Check your connection and try again.';
const FIELD_INPUT = `${INPUT} aria-[invalid=true]:border-bad`;

const readJson = (res) => res.json().catch(() => ({}));

async function uploadPhoto(authFetch, file) {
  try {
    const signRes = await authFetch('/api/federation/me/workers/photo/sign', { method: 'POST' });
    const signed = await readJson(signRes);
    if (!signRes.ok) return { error: signed.message || UPLOAD_FAILED };

    const body = new FormData();
    body.append('file', file);
    body.append('api_key', signed.apiKey);
    body.append('timestamp', String(signed.timestamp));
    body.append('folder', signed.folder);
    body.append('signature', signed.signature);

    const uploadRes = await fetch(signed.uploadUrl, { method: 'POST', body });
    const uploaded = await readJson(uploadRes);
    if (!uploadRes.ok || !uploaded.secure_url) return { error: UPLOAD_FAILED };
    return { url: uploaded.secure_url };
  } catch {
    return { error: UPLOAD_FAILED };
  }
}

function describedBy(...ids) {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(' ') : undefined;
}

function FieldMessages({ id, hint, error }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-bad">
          {error}
        </p>
      )}
    </>
  );
}

export default function AddWorkerDialog({ onClose, onAdded }) {
  const authFetch = useFetchWithAuth();
  const formId = useId();
  const ids = {
    name: `${formId}-name`,
    phone: `${formId}-phone`,
    aadhaar: `${formId}-aadhaar`,
    photo: `${formId}-photo`,
  };

  const [form, setForm] = useState({ name: '', phone: '', aadhaar: '' });
  const [photo, setPhoto] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [stage, setStage] = useState('idle');

  const busy = stage !== 'idle';

  useEffect(() => {
    if (!photo) return undefined;
    return () => URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  const requestClose = () => {
    if (!busy) onClose();
  };

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
      setPhoto(null);
      setErrors((prev) => ({ ...prev, photo: PHOTO_FILE_MESSAGE }));
      return;
    }
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setErrors((prev) => ({ ...prev, photo: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;

    const { values, errors: fieldErrors } = checkWorkerFields(form);
    if (!photo) fieldErrors.photo = WORKER_MESSAGES.photo;
    setErrors(fieldErrors);
    setFormError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    try {
      let photoUrl = uploaded?.file === photo.file ? uploaded.url : null;
      if (!photoUrl) {
        setStage('uploading');
        const upload = await uploadPhoto(authFetch, photo.file);
        if (upload.error) {
          setErrors({ photo: upload.error });
          return;
        }
        photoUrl = upload.url;
        setUploaded({ file: photo.file, url: photoUrl });
      }

      setStage('saving');
      const res = await authFetch('/api/federation/me/workers', {
        method: 'POST',
        body: JSON.stringify({ ...values, photoUrl }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        const fields = data.fields || {};
        const serverErrors = {};
        for (const field of ['name', 'phone', 'aadhaar']) {
          if (fields[field]) serverErrors[field] = fields[field];
        }
        if (fields.photoUrl) {
          serverErrors.photo = fields.photoUrl;
          setUploaded(null);
        }
        if (res.status === 409 && !serverErrors.phone) {
          serverErrors.phone = data.message || WORKER_MESSAGES.duplicate;
        }
        setErrors(serverErrors);
        if (Object.keys(serverErrors).length === 0) {
          setFormError(data.message || 'Could not add the worker. Try again.');
        }
        return;
      }

      onAdded(data.worker || data);
    } catch {
      setFormError(NETWORK_FAILED);
    } finally {
      setStage('idle');
    }
  };

  const submitLabel = { idle: 'Add worker', uploading: 'Uploading photo…', saving: 'Adding…' }[stage];

  return (
    <Modal
      open
      onClose={requestClose}
      title="Add worker"
      description="All fields are required."
      footer={
        <>
          <Button variant="secondary" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        {formError && <Notice>{formError}</Notice>}

        <div>
          <label htmlFor={ids.name} className={LABEL}>
            Full name
          </label>
          <input
            id={ids.name}
            type="text"
            value={form.name}
            onChange={updateField('name')}
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy(errors.name && `${ids.name}-error`)}
            className={FIELD_INPUT}
          />
          <FieldMessages id={ids.name} error={errors.name} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.phone} className={LABEL}>
              Mobile number
            </label>
            <input
              id={ids.phone}
              type="text"
              inputMode="numeric"
              value={form.phone}
              onChange={updateField('phone')}
              maxLength={16}
              autoComplete="off"
              placeholder="e.g. 98765 43210"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={describedBy(errors.phone && `${ids.phone}-error`)}
              className={FIELD_INPUT}
            />
            <FieldMessages id={ids.phone} error={errors.phone} />
          </div>

          <div>
            <label htmlFor={ids.aadhaar} className={LABEL}>
              Aadhaar number
            </label>
            <input
              id={ids.aadhaar}
              type="text"
              inputMode="numeric"
              value={form.aadhaar}
              onChange={updateField('aadhaar')}
              maxLength={14}
              autoComplete="off"
              placeholder="12 digits"
              aria-invalid={Boolean(errors.aadhaar)}
              aria-describedby={describedBy(`${ids.aadhaar}-hint`, errors.aadhaar && `${ids.aadhaar}-error`)}
              className={FIELD_INPUT}
            />
            <FieldMessages id={ids.aadhaar} hint="Only the last 4 digits are saved." error={errors.aadhaar} />
          </div>
        </div>

        <div>
          <span className={LABEL}>Photo</span>
          <div className="flex items-center gap-4">
            {photo ? (
              <img
                src={photo.previewUrl}
                alt="Selected photo"
                className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong bg-canvas text-ink-3">
                <ImagePlus className="w-6 h-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <input
                id={ids.photo}
                type="file"
                accept={PHOTO_TYPES.join(',')}
                onChange={choosePhoto}
                disabled={busy}
                aria-invalid={Boolean(errors.photo)}
                aria-describedby={describedBy(`${ids.photo}-hint`, errors.photo && `${ids.photo}-error`)}
                className="peer sr-only"
              />
              <label
                htmlFor={ids.photo}
                className={`${buttonClass('secondary', 'sm')} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
              >
                {photo ? 'Change photo' : 'Choose photo'}
              </label>
              {photo && <p className="mt-1.5 truncate text-xs text-ink-2">{photo.file.name}</p>}
              <FieldMessages id={ids.photo} hint="JPG, PNG or WebP, up to 10 MB." error={errors.photo} />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
