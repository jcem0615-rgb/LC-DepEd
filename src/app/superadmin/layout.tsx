'use client';

import { AppShell } from '@/components/app-shell';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="superadmin">{children}</AppShell>;
}
