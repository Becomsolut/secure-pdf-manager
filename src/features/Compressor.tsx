import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { UploadCloud, Loader2, CheckCircle, Download } from 'lucide-react';
import { SaveModal } from '../components/SaveModal';

export function Compressor({ onBack }: { onBack: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false);

  // State für das Ergebnis
  const [savings, setSavings] = useState<string | null>(null);
  const [compressedPdfBlob, setCompressedPdfBlob] = useState<Blob | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>("dokument.pdf");

  const [showSaveModal, setShowSaveModal] = useState(false);

  // Drag & Drop Listener
  useEffect(() => {
    const unlisten = listen('tauri://file-drop', (event) => {
      const paths = event.payload as string[];
      if (paths && paths.length > 0) {
        startCompression(paths[0]);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Datei auswählen Dialog
  const selectFile = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (selected && typeof selected === 'string') {
        startCompression(selected);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Komprimierung starten
  const startCompression = async (path: string) => {
    if (!path.toLowerCase().endsWith('.pdf')) {
      alert("Bitte nur PDF Dateien wählen.");
      return;
    }

    // Dateinamen merken für späteres Speichern
    const name = path.split(/[/\\]/).pop() || "dokument.pdf";
    setOriginalFileName(name);

    setIsProcessing(true);
    setSavings(null);
    setCompressedPdfBlob(null);

    try {
      // Rust Call: Gibt jetzt [Bytes, SavingsString] zurück
      const [bytes, savingsStr] = await invoke('compress_pdf', {
        filePath: path
      }) as [number[], string];

      // Blob erstellen
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });

      setCompressedPdfBlob(blob);
      setSavings(savingsStr);

    } catch (err) {
      console.error(err);
      alert("Fehler beim Komprimieren: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Wenn wir fertig sind (Ergebnis anzeigen)
  if (compressedPdfBlob && savings) {
    return (
      <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
        <SaveModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          pdfBlob={compressedPdfBlob}
          defaultFilename={`min_${originalFileName}`}
        />

        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">Komprimierung erfolgreich</h2>
        </div>

        <div className="flex flex-col items-center justify-center bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">

          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6 text-green-500 shadow-sm">
            <CheckCircle size={48} />
          </div>

          <h3 className="text-3xl font-bold text-slate-800 mb-2">
            Das PDF ist jetzt kleiner!
          </h3>

          <div className="text-6xl font-black text-green-500 my-6 tracking-tight">
            {savings}
          </div>

          <p className="text-slate-500 mb-8 max-w-md">
            Wir haben die Bilder im Dokument optimiert. Die Qualität ist weiterhin gut für den Bildschirmversand geeignet.
          </p>

          <div className="flex gap-4 w-full max-w-md">
            <button
              onClick={() => {
                setCompressedPdfBlob(null);
                setSavings(null);
              }}
              className="flex-1 py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Noch eine Datei
            </button>

            <button
              onClick={() => setShowSaveModal(true)}
              className="flex-1 bg-primary hover:bg-primaryHover text-white py-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Speichern
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Upload View
  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
        <h2 className="text-2xl font-bold ml-4 text-slate-800">PDF Komprimieren</h2>
      </div>

      <div
        onClick={!isProcessing ? selectFile : undefined}
        className={`
            border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center bg-slate-50 transition-all h-80 w-full relative overflow-hidden
            ${isProcessing ? 'border-slate-200 cursor-wait' : 'border-slate-300 hover:bg-blue-50 hover:border-blue-400 cursor-pointer group'}
          `}
      >
        {isProcessing ? (
          <div className="text-center z-10">
            <Loader2 size={64} className="text-primary animate-spin mb-6 mx-auto" />
            <h3 className="text-xl font-bold text-slate-700">Optimiere Bilder...</h3>
            <p className="text-slate-400 mt-2">Das kann einen Moment dauern.</p>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition-transform">
              <UploadCloud size={40} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <span className="text-xl font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
              PDF auswählen
            </span>
            <span className="text-sm text-slate-400 mt-2">oder hier reinziehen</span>
          </>
        )}
      </div>


    </div>
  );
}