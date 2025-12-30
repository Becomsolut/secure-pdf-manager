import { useRef, useState, useEffect } from 'react';
import { Check } from 'lucide-react';

type SignaturePadProps = {
  onConfirm: (signatureDataUrl: string) => void;
  onCancel: () => void;
};

export function SignaturePad({ onConfirm, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  // Initialisiere Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Größe setzen (fest für Modal)
    canvas.width = 500;
    canvas.height = 200;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000000';
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Support für Maus und Touch
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Verhindert Scrollen beim Touch
    setIsDrawing(true);
    setHasDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    ctx?.clearRect(0, 0, canvas!.width, canvas!.height);
    setHasDrawing(false);
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    // Bild als transparente PNG exportieren
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onConfirm(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-xl shadow-2xl max-w-lg w-full">
        <h3 className="text-xl font-bold mb-4 text-slate-800">Unterschrift zeichnen</h3>
        
        <div className="border-2 border-slate-200 rounded-lg bg-white overflow-hidden touch-none relative">
          <canvas
            ref={canvasRef}
            className="w-full h-[200px] cursor-crosshair bg-slate-50"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasDrawing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-slate-300 text-lg">Hier unterschreiben</span>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-4">
          <button onClick={clear} className="text-sm text-slate-400 hover:text-red-500">
            Löschen
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
              Abbrechen
            </button>
            <button 
              onClick={handleConfirm}
              disabled={!hasDrawing}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primaryHover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check size={18} />
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}