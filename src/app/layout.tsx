import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'LC-DepEd — School Management & Automation PWA',
    template: '%s · LC-DepEd',
  },
  description:
    'Offline-first DepEd school management PWA: attendance, DO 8 s.2015 grading, School Forms automation, dynamic student e-ID and free Web Push gate alerts.',
  manifest: '/manifest.webmanifest',
  applicationName: 'LC-DepEd',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LC-DepEd',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#1743e1',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
