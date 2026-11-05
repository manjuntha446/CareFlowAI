import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, ArrowRight, Keyboard } from 'lucide-react';

export default function QRScanner({ onScan, onClose }) {
  const [error, setError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [showManual, setShowManual] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const elementId = 'qr-camera-stream';
    let html5QrCode = null;
    let isScanning = false;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode(elementId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            handleDecodedText(decodedText);
          },
          () => {
            // Frame scan failure (no QR code found in frame), normal and silent
          }
        );
        isScanning = true;
      } catch (err) {
        console.warn('Camera start error:', err);
        setError('Camera unavailable or permission denied. You can enter the token below.');
        setShowManual(true);
      }
    };

    // Small delay to ensure modal DOM is mounted
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
          scannerRef.current.clear();
        } catch (_) {}
      }
    };
  }, []);

  const handleDecodedText = (raw) => {
    if (!raw) return;
    const clean = String(raw).trim();
    // If full URL was scanned (e.g. https://.../scan/TOKEN), extract token
    const urlMatch = clean.match(/\/scan\/([a-zA-Z0-9_-]+)/);
    const token = urlMatch ? urlMatch[1] : clean;

    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
      } catch (_) {}
    }

    onScan(token);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    handleDecodedText(manualToken.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1C3D6E] text-white">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">Scan Patient QR Code</h3>
              <p className="text-[11px] text-blue-200">Point camera at patient's permanent QR card</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera container */}
        <div className="p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>{error}</span>
            </div>
          )}

          <div
            id="qr-camera-stream"
            className="w-full overflow-hidden rounded-xl bg-slate-900 aspect-square flex items-center justify-center shadow-inner"
          />

          {/* Toggle manual entry */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-blue-900 hover:text-blue-700 transition"
            >
              <Keyboard size={14} />
              {showManual ? 'Hide manual entry' : 'Trouble scanning? Enter QR Token manually'}
            </button>

            {showManual && (
              <form onSubmit={handleManualSubmit} className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Paste QR token or Patient ID"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                />
                <button
                  type="submit"
                  disabled={!manualToken.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                >
                  <span>Go</span>
                  <ArrowRight size={13} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

