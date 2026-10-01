import { useState } from 'react';
import { avatarUrl } from '../utils/workerFields';

export default function WorkerAvatar({ name, photoUrl }) {
  const src = avatarUrl(photoUrl);
  const [failedSrc, setFailedSrc] = useState(null);

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className="h-9 w-9 shrink-0 rounded-full bg-canvas object-cover"
      />
    );
  }

  const initial = Array.from((name || '').trim())[0]?.toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent"
    >
      {initial}
    </span>
  );
}
