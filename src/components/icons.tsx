'use client';

/** Minimal inline icon set (24x24, stroke) — no icon-font download on 3G. */

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75',
  calendar: 'M7 3v3m10-3v3M4 8.5h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  document: 'M14 3v5h5M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5ZM9 13h6M9 17h6',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v14H6.5A2.5 2.5 0 0 0 4 19.5v-14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H19v-3',
  id: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 5.5a2 2 0 1 0 0-.01M6 16c.7-1.6 1.9-2.5 3-2.5s2.3.9 3 2.5M14.5 9.5H18M14.5 13H18',
  bell: 'M15 18a3 3 0 1 1-6 0m9-4V11a6 6 0 1 0-12 0v3l-1.5 3h15L18 14Z',
  chat: 'M20 12a7 7 0 0 1-7 7H8l-4 3 1.2-3.6A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z',
  check: 'm5 13 4 4 10-10',
  clipboard: 'M9 4h6v3H9V4Zm-2 1.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-1M9 12h6M9 16h4',
  cloud: 'M7.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18.4 10.5 3.75 3.75 0 0 1 18 19H7.5Z',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3Zm-2.5 9 2 2 4-4',
  server: 'M4 5.5h16v5H4v-5Zm0 8h16v5H4v-5ZM7.5 8h.01M7.5 16h.01',
  building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M8 8h3M8 12h3M8 16h3M3 21h18',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M4 12h16',
  users: 'M16 19v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V19M9.5 9.5a3 3 0 1 0 0-.01M17 13.2a4 4 0 0 1 4 3.8V19M16 6.2a3 3 0 0 1 0 5.6',
  cog: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0 .5 0 1-.1 1.4l2 1.6-2 3.5-2.4-1a8 8 0 0 1-2.4 1.4l-.4 2.6h-4l-.4-2.6a8 8 0 0 1-2.4-1.4l-2.4 1-2-3.5 2-1.6a8.2 8.2 0 0 1 0-2.8l-2-1.6 2-3.5 2.4 1a8 8 0 0 1 2.4-1.4L10 2h4l.4 2.6a8 8 0 0 1 2.4 1.4l2.4-1 2 3.5-2 1.6c.1.4.1.9.1 1.4Z',
  logout: 'M15 8V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2M10 12h10m0 0-3-3m3 3-3 3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.3 3.8-5.2 3.8-9S14.5 5.3 12 3C9.5 5.3 8.2 8.2 8.2 12s1.3 6.7 3.8 9ZM3.5 9h17M3.5 15h17',
  download: 'M12 4v10m0 0 4-4m-4 4-4-4M5 19h14',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M3 3l18 18',
  qr: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3h3m0 0v3m0-3h3m-6-3h6',
  sparkles: 'm12 3 1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3L12 3ZM18 15l.9 2.3L21 18l-2.1.8L18 21l-.9-2.2L15 18l2.1-.7L18 15Z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5.5 10h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = 'h-5 w-5',
  strokeWidth = 1.8,
}: {
  name: IconName | string;
  className?: string;
  strokeWidth?: number;
}) {
  const d = PATHS[name] ?? PATHS.document;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
