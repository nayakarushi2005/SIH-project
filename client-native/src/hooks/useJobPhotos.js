import { useCallback, useMemo, useRef, useState } from 'react';

import { getErrorMessage, uploadJobPhoto } from '../services/api';

/**
 * Job photos: each one uploads as soon as it's picked. `photos` entries look
 * like { key, uri, status: 'uploading'|'done'|'error', url }.
 */
export default function useJobPhotos() {
  const [photos, setPhotos] = useState([]);
  const nextPhotoKey = useRef(0);

  const updatePhoto = useCallback((key, changes) => {
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }, []);

  const upload = useCallback(
    async (photo) => {
      updatePhoto(photo.key, { status: 'uploading' });
      try {
        const url = await uploadJobPhoto(photo);
        updatePhoto(photo.key, { status: 'done', url });
      } catch (err) {
        console.warn('Job photo upload failed:', getErrorMessage(err));
        updatePhoto(photo.key, { status: 'error' });
      }
    },
    [updatePhoto]
  );

  const addPhotos = useCallback(
    (assets) => {
      const added = assets.map((asset) => ({
        key: String(nextPhotoKey.current++),
        uri: asset.uri,
        status: 'uploading',
        url: null,
      }));
      setPhotos((list) => [...list, ...added]);
      added.forEach(upload);
    },
    [upload]
  );

  const removePhoto = useCallback((key) => {
    setPhotos((list) => list.filter((p) => p.key !== key));
  }, []);

  const retryPhoto = useCallback(
    (key) => {
      const photo = photos.find((p) => p.key === key);
      if (photo) upload(photo);
    },
    [photos, upload]
  );

  const uploading = photos.some((p) => p.status === 'uploading');
  const allUploaded = photos.every((p) => p.status === 'done');
  const urls = useMemo(() => photos.filter((p) => p.status === 'done').map((p) => p.url), [photos]);

  return { photos, addPhotos, removePhoto, retryPhoto, uploading, allUploaded, urls };
}
