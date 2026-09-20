'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders a QR payload as a PNG data URL; regenerates whenever the value changes. */
export function QrCode({
  value,
  size = 240,
  className = '',
  alt = 'QR code',
}: {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        className={`grid place-items-center rounded-xl bg-slate-100 text-sm text-slate-500 ${className}`}
        style={{ width: size, height: size }}
      >
        QR unavailable
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`skeleton ${className}`} style={{ width: size, height: size }} aria-hidden="true" />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={`rounded-xl ${className}`} />;
}
