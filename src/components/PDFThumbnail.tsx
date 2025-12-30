import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileText } from 'lucide-react';

// Worker konfigurieren (Wichtig für Vite/Tauri)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Props {
  file: File;
  className?: string;
}

export function PDFThumbnail({ file, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const renderThumbnail = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Datei einlesen
        const arrayBuffer = await file.arrayBuffer();
        
        // PDF laden
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        // Erste Seite holen
        const page = await pdf.getPage(1);
        
        if (isCancelled || !canvasRef.current) return;

        // Viewport berechnen (wir wollen eine kleine Breite, z.B. 200px)
        const desiredWidth = 300; // Hohe Auflösung für Retina
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        // Canvas vorbereiten
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.height = scaledViewport.height;
          canvas.width = scaledViewport.width;

          // Rendern
          await page.render({
            canvasContext: context,
            viewport: scaledViewport,
            canvas: canvas,
          }).promise;
        }

      } catch (err) {
        console.error("Thumbnail error:", err);
        setError(true);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    renderThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [file]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-50 text-red-300 ${className}`}>
        <FileText size={32} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
        {/* Canvas für das Bild */}
        <canvas 
            ref={canvasRef} 
            className={`w-full h-full object-contain ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`} 
        />
        
        {/* Lade-Skelett */}
        {loading && (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-50 animate-pulse">
                <FileText size={32} className="text-slate-200" />
             </div>
        )}
    </div>
  );
}