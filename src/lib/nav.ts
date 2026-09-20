import type { Role } from './types';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const PORTAL_TITLE: Record<Role, string> = {
  superadmin: 'Super Admin System Portal',
  teacher: 'Teacher Portal',
  student: 'Student Portal',
  parent: 'Parent / Guardian Portal',
  schoolhead: 'School Head / Admin Portal',
  sdo: 'SDO / Regional Office Portal',
};

export const NAV: Record<Role, NavItem[]> = {
  superadmin: [
    { href: '/superadmin', label: 'Telemetry', icon: 'server' },
    { href: '/superadmin/tenants', label: 'Schools', icon: 'building' },
    { href: '/superadmin/privacy', label: 'Privacy', icon: 'shield' },
    { href: '/superadmin/flags', label: 'Feature Flags', icon: 'sparkles' },
    { href: '/superadmin/maintenance', label: 'Maintenance', icon: 'cog' },
  ],
  teacher: [
    { href: '/teacher', label: 'Dashboard', icon: 'home' },
    { href: '/teacher/attendance', label: 'Attendance', icon: 'calendar' },
    { href: '/teacher/grades', label: 'Grades', icon: 'chart' },
    { href: '/teacher/forms', label: 'School Forms', icon: 'document' },
    { href: '/teacher/dll', label: 'Lesson Log', icon: 'book' },
    { href: '/teacher/ipcrf', label: 'IPCRF', icon: 'clipboard' },
    { href: '/teacher/learners', label: 'Learners', icon: 'users' },
  ],
  student: [
    { href: '/student', label: 'Dashboard', icon: 'home' },
    { href: '/student/eid', label: 'My e-ID', icon: 'qr' },
    { href: '/student/grades', label: 'Grades', icon: 'chart' },
    { href: '/student/hub', label: 'Learning Hub', icon: 'book' },
  ],
  parent: [
    { href: '/parent', label: 'Dashboard', icon: 'home' },
    { href: '/parent/alerts', label: 'Gate Alerts', icon: 'bell' },
    { href: '/parent/progress', label: 'Report Card', icon: 'document' },
    { href: '/parent/messages', label: 'Messages', icon: 'chat' },
  ],
  schoolhead: [
    { href: '/school-head', label: 'Dashboard', icon: 'home' },
    { href: '/school-head/approvals', label: 'Approvals', icon: 'check' },
    { href: '/school-head/ntp', label: 'NTP Routing', icon: 'users' },
    { href: '/school-head/lis', label: 'LIS Sync', icon: 'cloud' },
    { href: '/school-head/audit', label: 'Audit', icon: 'shield' },
  ],
  sdo: [
    { href: '/sdo', label: 'Analytics', icon: 'chart' },
    { href: '/sdo/intake', label: 'Report Intake', icon: 'document' },
    { href: '/sdo/security', label: 'Security Console', icon: 'shield' },
  ],
};

export const SHARED_NAV: NavItem[] = [
  { href: '/scanner', label: 'Gate Scanner', icon: 'scan' },
];
