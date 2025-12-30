import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Lock, Unlock, Eye, EyeOff, ShieldCheck, Loader2, UploadCloud } from 'lucide-react';

export function Protector({ onBack }: { onBack: () => void }) {
  // Wir speichern Pfad und Namen separat (Native Way)
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- 1. NATIVE DRAG & DROP LISTENER ---
  useEffect(() => {
    const unlisten = listen('tauri://file-drop', (event) => {
      const paths = event.payload as string[];
      if (paths && paths.length > 0) {
        handleFileSelection(paths[0]);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // --- 2. DATEI AUSWÄHLEN (DIALOG) ---
  const selectFile = async () => {
    try {
        const selected = await dialogOpen({
            multiple: false,
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (selected && typeof selected === 'string') {
             handleFileSelection(selected);
        }
    } catch (err) {
        console.error(err);
    }
  };

  const handleFileSelection = (path: string) => {
    if (!path.toLowerCase().endsWith('.pdf')) {
        alert("Bitte nur PDF Dateien wählen.");
        return;
    }
    setFilePath(path);
    // Name aus Pfad extrahieren
    const name = path.split(/[/\\]/).pop() || "Dokument.pdf";
    setFileName(name);
    setPassword(""); // Reset Password
  };

  // KERNFUNKTION: Verschlüsseln via Rust
  const protectPdf = async () => {
    if (!filePath || !password) return;
    setIsProcessing(true);

    try {
      // Rust Backend aufrufen
      const newPath = await invoke('apply_encryption', { 
        filePath: filePath, 
        password: password 
      }) as string;
      
      // Erfolgsmeldung
      const userChoice = confirm(`Verschlüsselung erfolgreich!\n\nGespeichert unter:\n${newPath}\n\nMöchtest du den Ordner öffnen?`);
      
      if (userChoice) {
          // Wir versuchen, die Datei zu selektieren oder den Ordner zu öffnen
          // Einfachheitshalber öffnen wir die Datei selbst
          try {
            await shellOpen(newPath);
          } catch {
             // Fallback
          }
      }

      // Reset für nächste Datei
      setFilePath(null);
      setFileName(null);
      setPassword("");

    } catch (err) {
      console.error(err);
      alert("Fehler beim Verschlüsseln: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!filePath) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
         <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">Passwortschutz</h2>
        </div>
        
        {/* Native Drop Area */}
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
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button onClick={() => setFilePath(null)} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">
          ← Abbrechen
        </button>
        <h2 className="text-2xl font-bold ml-4 text-slate-800">Schützen: {fileName}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Linke Seite: Visualisierung */}
        <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl p-10 border border-slate-200">
           <div className={`p-6 rounded-full bg-white shadow-sm mb-4 transition-all duration-500 ${password.length > 0 ? 'text-green-500 scale-110' : 'text-slate-300'}`}>
              {password.length > 0 ? <ShieldCheck size={80} /> : <Unlock size={80} />}
           </div>
           <p className="text-center text-slate-500 max-w-xs">
             {password.length > 0 
               ? "Datei wird mit RC4 (128 Bit) verschlüsselt." 
               : "Geben Sie ein Passwort ein, um das Schloss zu schließen."}
           </p>
        </div>

        {/* Rechte Seite: Eingabe */}
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
          
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Neues Passwort vergeben
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Geheim123!"
                className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-medium text-slate-700 transition-all"
                autoFocus
              />
              <Lock className="absolute left-3 top-3.5 text-slate-400" size={18} />
              
              <button 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
            
            {/* Passwort-Stärke Indikator */}
            <div className="mt-2 flex gap-1 h-1">
                <div className={`flex-1 rounded-full transition-colors ${password.length > 0 ? 'bg-red-400' : 'bg-slate-100'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${password.length > 5 ? 'bg-yellow-400' : 'bg-slate-100'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${password.length > 8 ? 'bg-green-500' : 'bg-slate-100'}`}></div>
            </div>
          </div>

          <button
            onClick={protectPdf}
            disabled={password.length === 0 || isProcessing}
            className={`
              flex items-center justify-center gap-3 w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all
              ${password.length === 0 
                ? 'bg-slate-300 cursor-not-allowed' 
                : 'bg-primary hover:bg-primaryHover hover:scale-[1.02] active:scale-95'}
            `}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Lock size={20} />}
            {isProcessing ? 'Verschlüssele...' : 'Passwort setzen'}
          </button>
        </div>
      </div>
    </div>
  );
}