function toRgb(color) {
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  const value = color.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(color, amount) {
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const [r, g, b] = toRgb(color).map((c) => Math.round(c + (target - c) * p));
  return `rgb(${r}, ${g}, ${b})`;
}

export function withAlpha(color, alpha) {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
