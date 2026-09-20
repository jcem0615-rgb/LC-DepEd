'use client';

import { AppShell } from '@/components/app-shell';

export default function SdoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="sdo">{children}</AppShell>;
}
