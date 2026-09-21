/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ExcelJS and PDFKit are CommonJS libraries that read their own data files at
  // runtime; keep them out of the bundler so those reads keep working.
  serverExternalPackages: ['exceljs', 'pdfkit'],
  // PDFKit loads the standard-14 font metrics from .afm files with fs, which
  // static tracing cannot see. Without this the PDF route throws ENOENT on a
  // serverless deploy.
  outputFileTracingIncludes: {
    '/api/export/pdf': ['./node_modules/pdfkit/js/data/**'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
