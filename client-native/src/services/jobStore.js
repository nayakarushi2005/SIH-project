import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';

import { addRecentJob, getRecentJobs } from './session';

const jobsFile = () => new File(Paths.document, 'posted-jobs.json');
const imagesDir = () => new Directory(Paths.document, 'job-images');

let jobs = [];
let loaded = false;
let loading = null;
const listeners = new Set();

function emit(next) {
  jobs = next;
  listeners.forEach((listener) => listener());
}

async function readJobs() {
  const file = jobsFile();
  if (file.exists) {
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  const recent = await getRecentJobs().catch(() => []);
  return recent
    .filter((job) => job.status === 'posted')
    .map((job) => ({ ...job, postedAt: job.postedAt ?? job.updatedAt }));
}

function load() {
  if (loaded || loading) return loading;
  loading = readJobs()
    .then((result) => {
      loaded = true;
      emit(result);
    })
    .catch(() => {
      loaded = true;
      emit([]);
    });
  return loading;
}

function subscribe(listener) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return jobs;
}

async function persistImage(uri, id) {
  if (!uri || !uri.startsWith('file://')) return uri;
  try {
    const dir = imagesDir();
    dir.create({ idempotent: true, intermediates: true });
    const source = new File(uri);
    const extension = uri.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg';
    const target = new File(dir, `${id}${extension}`);
    if (target.exists) target.delete();
    await source.copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

export function usePostedJobs() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export async function addPostedJob(job) {
  await load();
  const entry = {
    ...job,
    image: await persistImage(job.image, job.id),
    status: job.status ?? 'posted',
    postedAt: Date.now(),
  };
  const next = [entry, ...jobs.filter((j) => j.id !== entry.id)];
  jobsFile().write(JSON.stringify(next));
  emit(next);
  await addRecentJob(entry);
  return entry;
}
