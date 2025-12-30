import { useState, useEffect } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { downloadDir, join } from '@tauri-apps/api/path';// <--- NEU
import { invoke } from "@tauri-apps/api/core";
import { PDFDocument } from 'pdf-lib'; 
import { renderPdfToImages } from '../utils/pdfRenderer';
import { 
  X, Download, FolderInput, User, FileText, Loader2, 
  Check, Lock, Unlock, Eye, EyeOff 
} from 'lucide-react';

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pdfBlob: Blob | null;
  defaultFilename?: string;
};

export function SaveModal({ isOpen, onClose, pdfBlob, defaultFilename = "dokument.pdf" }: SaveModalProps) {
  // Input States
  const [filename, setFilename] = useState(defaultFilename.replace('.pdf', ''));
  const [author, setAuthor] = useState("Benutzer");
  
  // Encryption States
  const [useEncryption, setUseEncryption] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Preview / Processing States
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successPath, setSuccessPath] = useState<string | null>(null);

  // Init
  useEffect(() => {
    if (isOpen && pdfBlob) {
      setSuccessPath(null);
      setIsSaving(false);
      setUseEncryption(false);
      setPassword("");
      setFilename(defaultFilename.replace('.pdf', ''));

      // Vorschau
      setIsLoadingPreview(true);
      const file = new File([pdfBlob], "preview.pdf", { type: 'application/pdf' });
      renderPdfToImages(file).then(images => {
        if (images.length > 0) setPreviewImage(images[0]);
        setIsLoadingPreview(false);
      }).catch(() => setIsLoadingPreview(false));
    }
  }, [isOpen, pdfBlob, defaultFilename]);

  // Metadaten setzen
  const prepareFinalPdfBytes = async (): Promise<Uint8Array> => {
    if (!pdfBlob) throw new Error("Kein PDF");
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    pdfDoc.setTitle(filename);
    pdfDoc.setAuthor(author);
    pdfDoc.setCreator("Secure PDF Tool");

    return await pdfDoc.save();
  };

  const handleSave = async (method: 'downloads' | 'dialog') => {
    if (!pdfBlob) return;
    setIsSaving(true);

    try {
      const finalPdfBytes = await prepareFinalPdfBytes();
      const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

      let savePath: string | null = null;

      if (method === 'dialog') {
        // Option A: Dialog öffnen
        savePath = await save({
          defaultPath: finalName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
      } else {
        // Option B: Downloads Ordner ermitteln (NEU & FIX)
        const downloadDirPath = await downloadDir();
        savePath = await join(downloadDirPath, finalName);
      }

      if (!savePath) {
        setIsSaving(false);
        return; 
      }

      // 1. Datei schreiben
      await writeFile(savePath, finalPdfBytes);

      // 2. Verschlüsseln (Funktioniert jetzt auch bei Downloads, da wir den Pfad haben!)
      if (useEncryption && password.length > 0) {
        const securePath = await invoke('apply_encryption', {
            filePath: savePath,
            password: password
        }) as string;
        setSuccessPath(securePath);
      } else {
        setSuccessPath(savePath);
      }

    } catch (err) {
      console.error(err);
      alert("Fehler: " + err); // Zeigt uns Permissions Fehler an, falls noch vorhanden
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        
        {/* Linke Spalte: Vorschau */}
        <div className="w-full md:w-5/12 bg-slate-100 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 relative">
          {isLoadingPreview ? (
            <div className="flex flex-col items-center text-slate-400">
              <Loader2 className="animate-spin mb-2" />
              <span className="text-xs">Vorschau wird geladen...</span>
            </div>
          ) : previewImage ? (
            <div className="relative shadow-xl group transition-transform duration-500 hover:scale-105">
                <img src={previewImage} alt="Cover" className="max-h-[350px] object-contain bg-white rounded-sm border border-slate-300" />
                <div className="absolute -bottom-8 left-0 right-0 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-200/50 px-2 py-1 rounded">Seite 1</span>
                </div>
                {useEncryption && (
                    <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] flex items-center justify-center rounded-sm">
                        <Lock size={48} className="text-white drop-shadow-lg" />
                    </div>
                )}
            </div>
          ) : (
            <div className="text-slate-400 flex flex-col items-center">
                <FileText size={48} className="mb-2 opacity-50"/>
                <span>Keine Vorschau</span>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Formular */}
        <div className="w-full md:w-7/12 p-8 flex flex-col overflow-y-auto">
          
          <div className="flex justify-between items-start mb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Speichern</h2>
                <p className="text-slate-500 text-sm">Metadaten & Sicherheit</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* SUCCESS STATE */}
          {successPath ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                    <Check size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Erfolgreich!</h3>
                <p className="text-slate-500 mb-6 text-sm px-8 break-all">
                    Gespeichert unter:<br/>
                    <span className="font-mono bg-slate-50 px-2 py-1 rounded text-xs text-slate-600">{successPath}</span>
                </p>
                <button onClick={onClose} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">
                    Schließen
                </button>
            </div>
          ) : (
            
            /* NORMAL FORM STATE */
            <div className="space-y-6 flex-1">
                
                {/* 1. Dateiname */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dateiname</label>
                    <div className="relative group">
                        <input 
                            type="text" 
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                            placeholder="Mein Dokument"
                        />
                        <FileText className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <span className="absolute right-4 top-3.5 text-slate-400 font-bold text-sm bg-slate-100 px-1 rounded">.PDF</span>
                    </div>
                </div>

                {/* 2. Autor */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Autor</label>
                    <div className="relative group">
                        <input 
                            type="text" 
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                        />
                        <User className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    </div>
                </div>

                {/* 3. Verschlüsselung */}
                <div className={`border-2 rounded-xl overflow-hidden transition-all duration-300 ${useEncryption ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200'}`}>
                    
                    <div 
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setUseEncryption(!useEncryption)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${useEncryption ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                {useEncryption ? <Lock size={20}/> : <Unlock size={20}/>}
                            </div>
                            <div>
                                <h4 className={`font-bold text-sm ${useEncryption ? 'text-blue-700' : 'text-slate-600'}`}>PDF Verschlüsseln</h4>
                                {!useEncryption && <p className="text-[10px] text-slate-400">Klicken zum Aktivieren</p>}
                            </div>
                        </div>
                        
                        <div className={`w-11 h-6 rounded-full relative transition-colors ${useEncryption ? 'bg-blue-500' : 'bg-slate-300'}`}>
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${useEncryption ? 'translate-x-6' : 'translate-x-1'}`}></div>
                        </div>
                    </div>

                    {useEncryption && (
                        <div className="p-4 pt-0 animate-in slide-in-from-top-2">
                             <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Passwort eingeben..."
                                    className="w-full pl-4 pr-10 py-3 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                                    autoFocus
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-slate-400 hover:text-blue-600 p-1"
                                >
                                    {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                                </button>
                             </div>
                             <p className="text-[10px] text-blue-600/70 mt-2 flex items-center gap-1">
                                <Lock size={10} /> 
                                Datei wird mit RC4 (128-bit) geschützt.
                             </p>
                        </div>
                    )}
                </div>

                {/* 4. Action Buttons */}
                <div className="pt-4 space-y-3">
                    
                    {/* BUTTON IST JETZT AKTIV - auch bei Encryption! */}
                    <button 
                        onClick={() => handleSave('downloads')}
                        // Deaktiviert nur, wenn Encryption AN ist aber KEIN Passwort gesetzt wurde
                        disabled={isSaving || (useEncryption && password.length === 0)}
                        className="w-full flex items-center justify-center gap-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 rounded-xl font-bold transition-all active:scale-[0.98]"
                    >
                        <Download size={20} />
                        In "Downloads" speichern
                    </button>

                    <button 
                        onClick={() => handleSave('dialog')}
                        disabled={isSaving || (useEncryption && password.length === 0)}
                        className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 px-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all"
                    >
                        {isSaving ? <Loader2 className="animate-spin" /> : <FolderInput size={20} />}
                        {isSaving ? 'Wird gespeichert...' : 'Speicherort wählen...'}
                    </button>

                </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}