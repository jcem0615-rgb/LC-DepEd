'use client';

import { AppShell } from '@/components/app-shell';

export default function SchoolHeadLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="schoolhead">{children}</AppShell>;
}
