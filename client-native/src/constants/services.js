// Service catalogue shown on the home screen. Hard-coded until the backend
// owns categories; `icon` is a MaterialCommunityIcons name.

export const SERVICES = [
  { id: 'electrician', label: 'Electrician', icon: 'flash' },
  { id: 'cleaning', label: 'Cleaning', icon: 'broom' },
  { id: 'plumber', label: 'Plumber', icon: 'pipe-wrench' },
  { id: 'carpenter', label: 'Carpenter', icon: 'hand-saw' },
  { id: 'painter', label: 'Painter', icon: 'format-paint' },
  { id: 'caregiver', label: 'Caregiver', icon: 'account-heart' },
  { id: 'driver', label: 'Driver', icon: 'car' },
  { id: 'gardener', label: 'Gardener', icon: 'flower' },
  { id: 'technician', label: 'Technician', icon: 'tools' },
];

export function getService(id) {
  return SERVICES.find((s) => s.id === id) ?? null;
}

// Until we have booking data, "most booked" is a fixed pick.
export const MOST_BOOKED = ['electrician', 'cleaning', 'plumber', 'carpenter'].map(getService);

export const BANNERS = [
  {
    id: 'emergency',
    title: 'Emergency repairs',
    body: 'Power cut or a burst pipe? Get a verified worker at your door fast.',
    cta: 'Book now',
    serviceId: 'electrician',
    icon: 'alarm-light',
    tone: 'dark',
  },
  {
    id: 'deep-clean',
    title: 'Festive deep cleaning',
    body: 'Whole-home cleaning by cooperative teams, priced fairly.',
    cta: 'Book cleaning',
    serviceId: 'cleaning',
    icon: 'spray-bottle',
    tone: 'soft',
  },
  {
    id: 'verified',
    title: 'Every worker is verified',
    body: 'Cooperative members with checked identity and fair wages.',
    cta: 'Find a worker',
    serviceId: null,
    icon: 'shield-check',
    tone: 'outline',
  },
];
