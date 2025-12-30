import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core"; 
import { open as shellOpen } from "@tauri-apps/plugin-shell"; // Zum Öffnen des Ergebnis-Ordners
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"; // Zum Auswählen der Datei
import { listen } from "@tauri-apps/api/event"; // Für Drag & Drop
import { Minimize2, CheckCircle2, FolderOpen, Loader2, UploadCloud } from 'lucide-react';

export function Compressor({ onBack }: { onBack: () => void }) {
  // Wir speichern jetzt direkt den Pfad und Namen, nicht mehr das File Objekt
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  //const [originalSize, setOriginalSize] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ path: string; savings: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- 1. NATIVE DRAG & DROP LISTENER ---
  useEffect(() => {
    // Wenn eine Datei ins Fenster gezogen wird (egal wo)
    const unlisten = listen('tauri://file-drop', (event) => {
      const paths = event.payload as string[];
      if (paths && paths.length > 0) {
        // Wir nehmen die erste Datei
        const path = paths[0];
        if (path.toLowerCase().endsWith('.pdf')) {
            handleFileSelection(path);
        } else {
            setError("Bitte nur PDF-Dateien verwenden.");
        }
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // --- 2. DATEI AUSWÄHLEN (DIALOG) ---
  const selectFile = async () => {
    try {
        const selected = await dialogOpen({
            multiple: false,
            filters: [{
                name: 'PDF',
                extensions: ['pdf']
            }]
        });

        if (selected && typeof selected === 'string') { // Sicherstellen, dass es ein String ist
             handleFileSelection(selected);
        }
    } catch (err) {
        console.error(err);
    }
  };

  // Gemeinsame Logik zum Verarbeiten des Pfades
  const handleFileSelection = async (path: string) => {
    setFilePath(path);
    setResult(null);
    setError(null);
    
    // Dateinamen aus Pfad extrahieren (simpel)
    // Windows nutzt \, Mac/Linux /
    const name = path.split(/[/\\]/).pop() || "Unbekannt.pdf";
    setFileName(name);

    
  };


  const startCompression = async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setError(null);

    try {
      // Pfad direkt an Rust senden - sicher und sauber
      const [newPath, savings] = await invoke('compress_pdf', { filePath }) as [string, string];
      
      setResult({
        path: newPath,
        savings: savings
      });

    } catch (err) {
      console.error(err);
      setError("Komprimierung fehlgeschlagen.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openResultFolder = async () => {
    if (result) {
        try {
            await shellOpen(result.path); 
        } catch (e) {
            alert(`Gespeichert unter: ${result.path}`);
        }
    }
  };

  // View 1: Upload (Angepasst für Native Logik)
  if (!result) {
    return (
      <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">PDF Verkleinern</h2>
        </div>

        {filePath ? (
          <div className="bg-white p-10 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
            <div className="bg-blue-50 p-4 rounded-full mb-4">
              <Minimize2 size={40} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{fileName}</h3>
            <p className="text-slate-500 mb-8 text-sm">
                Bereit zur lokalen Optimierung.
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm max-w-md">
                {error}
              </div>
            )}

            <button
              onClick={startCompression}
              disabled={isProcessing}
              className="bg-primary hover:bg-primaryHover text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-70 disabled:scale-100"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Minimize2 size={24} />}
              {isProcessing ? 'Optimiere Bilder...' : 'Jetzt Komprimieren'}
            </button>
            
            <button onClick={() => setFilePath(null)} className="mt-6 text-slate-400 text-sm hover:text-slate-600 underline">
              Andere Datei wählen
            </button>
          </div>
        ) : (
          // Custom DropZone für Native Click
          <div 
            onClick={selectFile}
            className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50 hover:border-blue-400 transition-colors cursor-pointer group h-64 w-full"
          >
             <UploadCloud size={48} className="text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
             <span className="text-lg font-medium text-slate-600 group-hover:text-blue-600">
                Klicken zum Auswählen
             </span>
             <span className="text-sm text-slate-400 mt-2">oder PDF einfach ins Fenster ziehen</span>
          </div>
        )}
      </div>
    );
  }

  // View 2: Ergebnis
  return (
    <div className="w-full max-w-4xl animate-in zoom-in-95 duration-300">
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
        </div>

        <div className="bg-white p-12 rounded-2xl border-2 border-green-100 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-green-500"></div>
            
            <div className="bg-green-100 p-5 rounded-full mb-6 text-green-600">
                <CheckCircle2 size={48} />
            </div>

            <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Erfolgreich verkleinert!</h2>
            <p className="text-slate-500 mb-8">Ihre Datei wurde optimiert und gespeichert.</p>

            <div className="flex items-center gap-8 mb-10 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <div className="text-left">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-400 uppercase">Ergebnis</p>
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{result.savings}</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">Optimiert</p>
                </div>
            </div>

            <div className="flex gap-4">
                <button 
                    onClick={() => setFilePath(null)}
                    className="px-6 py-3 rounded-xl border-2 border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    Nächste Datei
                </button>
                <button 
                    onClick={openResultFolder}
                    className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-200 flex items-center gap-2 transition-transform hover:scale-105"
                >
                    <FolderOpen size={20} />
                    Datei öffnen
                </button>
            </div>
            
            <p className="mt-6 text-xs text-slate-400">
                Gespeichert unter:<br/>
                <span className="font-mono bg-slate-100 px-1 rounded">{result.path}</span>
            </p>
        </div>
    </div>
  );
}