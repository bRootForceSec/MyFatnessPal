import { useEffect, useRef, useState } from 'react';

/** Full-screen camera view that reads a product barcode. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let stop: (() => void) | undefined;
    let done = false;
    (async () => {
      try {
        // Loaded only when scanning, to keep the app quick to open.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          video.current!,
          (result) => {
            if (result && !done) {
              done = true;
              navigator.vibrate?.(60);
              controls.stop();
              onCode(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (done) controls.stop();
      } catch (e) {
        setError(
          e instanceof Error && /permission|denied|notallowed/i.test(e.name + e.message)
            ? 'Camera access was blocked. Allow camera access for this site in your browser settings.'
            : 'Could not start the camera on this device.',
        );
      }
    })();
    return () => {
      done = true;
      stop?.();
    };
  }, [onCode]);

  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <div className="scan-frame" />
      <div className="scanner-bar">
        {error ? <p>{error}</p> : <p>Point the camera at a barcode</p>}
        <div className="row-btns">
          <input
            inputMode="numeric"
            placeholder="Or type the number"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
          />
          <button className="secondary" disabled={typed.length < 8} onClick={() => onCode(typed)}>
            Look up
          </button>
        </div>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
