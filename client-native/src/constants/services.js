import {
  AirVent,
  Car,
  Hammer,
  HeartHandshake,
  PaintRoller,
  PlugZap,
  Shovel,
  SprayCan,
  Truck,
  Wrench,
} from 'lucide-react-native';

export const SERVICES = [
  { id: 'electrician', label: 'Electrician', icon: PlugZap, color: '#FF9500' },
  { id: 'movers', label: 'Movers', icon: Truck, color: '#5E5CE6' },
  { id: 'plumber', label: 'Plumber', icon: Wrench, color: '#0A84FF' },
  { id: 'carpenter', label: 'Carpenter', icon: Hammer, color: '#FF6B3D' },
  { id: 'cleaning', label: 'Cleaning', icon: SprayCan, color: '#14B8A6' },
  { id: 'painter', label: 'Painter', icon: PaintRoller, color: '#EC4899' },
  { id: 'technician', label: 'AC & appliances', icon: AirVent, color: '#06B6D4' },
  { id: 'caregiver', label: 'Caregiver', icon: HeartHandshake, color: '#F43F5E' },
  { id: 'driver', label: 'Driver', icon: Car, color: '#8B5CF6' },
  { id: 'gardener', label: 'Gardener', icon: Shovel, color: '#22C55E' },
];

export function getService(id) {
  return SERVICES.find((s) => s.id === id) ?? null;
}

export const MOST_BOOKED = ['electrician', 'movers', 'plumber', 'carpenter'].map(getService);

export const BANNERS = [
  {
    id: 'festive-lights',
    jobTitle: 'Install festive lights and fix wiring',
    title: 'Festive lighting setup',
    body: 'Decorative lights, extra sockets and a wiring check by a verified electrician.',
    cta: 'Book electrician',
    serviceId: 'electrician',
    icon: PlugZap,
    background: '#C2410C',
    foreground: '#FFFFFF',
  },
  {
    id: 'monsoon-leaks',
    jobTitle: 'Fix leaking taps and pipes',
    title: 'Leak-proof before monsoon',
    body: 'Taps, pipe joints and tank overflow fixed in a single visit.',
    cta: 'Book plumber',
    serviceId: 'plumber',
    icon: Wrench,
    background: '#1D4ED8',
    foreground: '#FFFFFF',
  },
  {
    id: 'furniture-repair',
    jobTitle: 'Repair and polish wooden furniture',
    title: 'Furniture repair and polish',
    body: 'Loose joints, broken hinges and a fresh polish for beds, tables and doors.',
    cta: 'Book carpenter',
    serviceId: 'carpenter',
    icon: Hammer,
    background: '#6D28D9',
    foreground: '#FFFFFF',
  },
  {
    id: 'house-shifting',
    jobTitle: 'Home shifting with packing and truck',
    title: 'Shifting homes?',
    body: 'Packers and movers with a truck, loading and unloading included.',
    cta: 'Find movers',
    serviceId: 'movers',
    icon: Truck,
    background: '#FACC15',
    foreground: '#1C1917',
  },
];
