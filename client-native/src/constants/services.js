// Offline fallback for the category catalogue (the backend owns the real
// list — see hooks/useCategories.js), plus home-screen picks and banners.
// `icon` is a MaterialCommunityIcons name.

export const FALLBACK_GROUPS = [
  {
    slug: 'home_services',
    name: 'Home services',
    icon: 'home-city',
    categories: [
      { slug: 'electrician', name: 'Electrician', icon: 'flash' },
      { slug: 'cleaning', name: 'House cleaning', icon: 'broom' },
      { slug: 'plumber', name: 'Plumber', icon: 'pipe-wrench' },
      { slug: 'carpenter', name: 'Carpenter', icon: 'hand-saw' },
      { slug: 'painter', name: 'Painter', icon: 'format-paint' },
      { slug: 'gardener', name: 'Gardener', icon: 'flower' },
    ],
  },
  {
    slug: 'more',
    name: 'More',
    icon: 'dots-grid',
    categories: [
      { slug: 'technician', name: 'Appliance technician', icon: 'tools' },
      { slug: 'caregiver', name: 'Elderly caregiver', icon: 'account-heart' },
      { slug: 'driver', name: 'Car driver', icon: 'car' },
    ],
  },
];

// Until we have booking data, "most booked" is a fixed pick.
export const MOST_BOOKED_SLUGS = ['electrician', 'cleaning', 'plumber', 'carpenter'];

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
