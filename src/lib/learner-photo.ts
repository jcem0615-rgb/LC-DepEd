/**
 * Learner portrait for the e-ID.
 *
 * Schools upload a real photo in production (`Student.photoUrl`). Until one
 * exists the learner gets a stable generated portrait — same learner, same
 * picture on every device — so the ID card, the roster and the printed card all
 * show the same face card rather than an empty frame.
 */

export interface PhotoSubject {
  firstName: string;
  lastName: string;
  lrn: string;
  photoUrl?: string;
}

export interface PortraitSpec {
  initials: string;
  hue: number;
  background: string;
  foreground: string;
}

/** Stable 32-bit hash so a learner's colour never changes between devices. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function portraitSpec(subject: PhotoSubject): PortraitSpec {
  const initials = `${subject.firstName?.[0] ?? ''}${subject.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const hue = hash(subject.lrn || subject.lastName) % 360;
  return {
    initials,
    hue,
    background: `hsl(${hue} 62% 42%)`,
    foreground: '#ffffff',
  };
}

/** Portrait as an inline SVG data URL — crisp at any size, no network request. */
export function learnerPortraitSvg(subject: PhotoSubject): string {
  if (subject.photoUrl) return subject.photoUrl;
  const { initials, hue } = portraitSpec(subject);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="120" height="150">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 60% 48%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 64% 34%)"/>
    </linearGradient>
  </defs>
  <rect width="120" height="150" fill="url(#g)"/>
  <circle cx="60" cy="58" r="26" fill="rgba(255,255,255,0.22)"/>
  <path d="M18 150c0-25 19-42 42-42s42 17 42 42z" fill="rgba(255,255,255,0.22)"/>
  <text x="60" y="70" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="30" font-weight="700" fill="#ffffff">${initials}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Portrait as a PNG data URL, for embedding in the printed ID card. PDFKit
 * accepts PNG and JPEG only, so the SVG version cannot be reused there.
 */
export function learnerPortraitPng(subject: PhotoSubject, size = 320): string | null {
  if (subject.photoUrl && /^data:image\/(png|jpeg);base64,/.test(subject.photoUrl)) {
    return subject.photoUrl;
  }
  if (typeof document === 'undefined') return null;

  const width = size;
  const height = Math.round(size * 1.25);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { initials, hue } = portraitSpec(subject);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `hsl(${hue} 60% 48%)`);
  gradient.addColorStop(1, `hsl(${hue} 64% 34%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(width / 2, height * 0.387, width * 0.217, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width * 0.15, height);
  ctx.bezierCurveTo(width * 0.15, height * 0.72, width * 0.85, height * 0.72, width * 0.85, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(width * 0.25)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, width / 2, height * 0.387);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
