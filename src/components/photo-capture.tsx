'use client';

/**
 * Learner ID photo: upload a file or take one with the device camera.
 *
 * Captured images are cropped to the 4:5 ID ratio and downscaled before they
 * are stored, so a 12-megapixel phone photo does not land in IndexedDB — and
 * the picture stays on the device until the sync queue drains it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from './ui';
import { Icon } from './icons';

const OUTPUT_WIDTH = 480;
const ASPECT = 1.25; // height / width, a 4:5 ID portrait

/** Crops an image source to the ID ratio and returns a compressed JPEG data URL. */
function toPortraitDataUrl(source: CanvasImageSource, width: number, height: number): string | null {
  const targetW = OUTPUT_WIDTH;
  const targetH = Math.round(OUTPUT_WIDTH * ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Cover-crop around the centre so faces are not squashed.
  const scale = Math.max(targetW / width, targetH / height);
  const drawW = width * scale;
  const drawH = height * scale;
  ctx.drawImage(source, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

export function PhotoCapture({
  currentPhoto,
  label = 'ID photo',
  onSave,
  onRemove,
}: {
  currentPhoto?: string;
  label?: string;
  onSave: (dataUrl: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraOpen = stream !== null;

  const stopCamera = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  // Attach the stream once React has actually rendered the <video>; doing it
  // straight after getUserMedia raced the render and left a blank preview.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const play = () => void video.play().catch(() => undefined);
    if (video.readyState >= 1) play();
    else video.addEventListener('loadedmetadata', play, { once: true });
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Use "Upload photo" instead.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setStream(media);
    } catch (err) {
      stopCamera();
      setError(
        err instanceof Error && /permission|NotAllowed/i.test(err.message)
          ? 'Camera permission was denied. Allow it in your browser settings, or upload a photo instead.'
          : 'No camera is available on this device. Use "Upload photo" instead.',
      );
    }
  }, [stopCamera]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setError(null);

    // The first frame can arrive a moment after the preview appears.
    const deadline = Date.now() + 3000;
    while (!video.videoWidth && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (!video.videoWidth) {
      setBusy(false);
      setError('The camera did not produce an image. Try again, or upload a photo instead.');
      return;
    }

    const dataUrl = toPortraitDataUrl(video, video.videoWidth, video.videoHeight);
    stopCamera();
    if (dataUrl) await onSave(dataUrl);
    else setError('The photo could not be processed on this device.');
    setBusy(false);
  }, [onSave, stopCamera]);

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError('Choose an image file.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const bitmapUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('decode failed'));
          img.src = bitmapUrl;
        });
        const dataUrl = toPortraitDataUrl(img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(bitmapUrl);
        if (dataUrl) await onSave(dataUrl);
        else setError('The photo could not be processed on this device.');
      } catch {
        setError('That image could not be read.');
      }
      setBusy(false);
    },
    [onSave],
  );

  return (
    <div>
      <p className="label">{label}</p>

      {cameraOpen ? (
        <div className="rounded-xl bg-slate-900 p-3">
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="Camera preview"
            className="mx-auto aspect-[4/5] w-full max-w-[240px] rounded-lg object-cover"
          />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-sm bg-white text-slate-900" disabled={busy} onClick={() => void shoot()}>
              <Icon name="id" className="h-4 w-4" />
              {busy ? 'Saving…' : 'Capture'}
            </button>
            <button type="button" className="btn btn-sm border-2 border-white/30 text-white" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void openCamera()}>
            <Icon name="id" className="h-4 w-4" />
            Take a photo
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="download" className="h-4 w-4" />
            {busy ? 'Processing…' : 'Upload photo'}
          </button>
          {currentPhoto && onRemove && (
            <button
              type="button"
              className="btn btn-sm text-rose-700 hover:bg-rose-50"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              Remove photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            // On a phone this offers the camera directly as well as the gallery.
            capture="user"
            className="sr-only"
            aria-label="Choose an ID photo"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {error && (
        <div className="mt-2">
          <Banner tone="warning">{error}</Banner>
        </div>
      )}
    </div>
  );
}
