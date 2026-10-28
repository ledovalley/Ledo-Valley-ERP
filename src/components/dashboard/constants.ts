// Precomputed radial tick marks for watch/chronograph dialer (Reference Image Design)
export const DIAL_TICKS = Array.from({ length: 48 }).map((_, i) => {
  const angle = (i * 360) / 48; // every 7.5 degrees (0 is at 12 o'clock)
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = +(80 + 62.5 * Math.cos(rad)).toFixed(2);
  const y1 = +(80 + 62.5 * Math.sin(rad)).toFixed(2);
  const x2 = +(80 + 54.5 * Math.cos(rad)).toFixed(2);
  const y2 = +(80 + 54.5 * Math.sin(rad)).toFixed(2);
  return { id: i, x1, y1, x2, y2, angle };
});

export const DEFAULT_ROUTES = ['Dibrugarh', 'Tinsukia Retail', 'Dibrugarh Market', 'Digboi Highway'];
