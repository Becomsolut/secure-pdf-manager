import { useState, useEffect } from 'react';
import { renderPdfToImages } from '../utils/pdfRenderer';
import { X, Download, FolderInput, User, FileText, Loader2 } from 'lucide-react';

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pdfBlob: Blob | null; // Das fertige PDF
  defaultFilename?: string;
};

export function SaveModal({ isOpen, onClose, pdfBlob, defaultFilename = "dokument.pdf" }: SaveModalProps) {
  const [filename, setFilename] = useState(defaultFilename.replace('.pdf', ''));
  const [author, setAuthor] = useState("Benutzer"); // Später: Via Rust den PC-Namen holen
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Reset und Vorschau generieren, wenn das Modal aufgeht
  useEffect(() => {
    if (isOpen && pdfBlob) {
      setIsLoadingPreview(true);
      
      // Blob in ein File-Objekt wandeln, damit unser Renderer es versteht
      const file = new File([pdfBlob], "preview.pdf", { type: 'application/pdf' });
      
      renderPdfToImages(file).then(images => {
        if (images.length > 0) {
          setPreviewImage(images[0]);
        }
        setIsLoadingPreview(false);
      }).catch(() => setIsLoadingPreview(false));

      // Filename resetten
      setFilename(defaultFilename.replace('.pdf', ''));
    }
  }, [isOpen, pdfBlob, defaultFilename]);

  if (!isOpen || !pdfBlob) return null;

  // Speicher-Logik (Frontend-basiert für jetzt)
  const handleDownload = (method: 'quick' | 'dialog') => {
    const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    
    // Metadaten setzen (Autor) - Das machen wir via PDF-Lib eigentlich vor dem Blob,
    // aber für die UX simulieren wir hier das Speichern.
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    
    if (method === 'dialog') {
      // Hinweis: Echte System-Dialoge ("Speichern unter...") erfordern das Rust-Backend.
      // Für jetzt simulieren wir es, indem wir den Download starten.
      // In Phase 4 ersetzen wir das durch: dialog.save() von Tauri.
      console.log("Öffne System Dialog für:", finalName, "Autor:", author);
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        
        {/* LINKE SÄULE: VORSCHAU */}
        <div className="w-full md:w-5/12 bg-slate-100 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 relative">
          {isLoadingPreview ? (
            <div className="flex flex-col items-center text-slate-400">
              <Loader2 className="animate-spin mb-2" />
              <span className="text-xs">Generiere Vorschau...</span>
            </div>
          ) : previewImage ? (
            <div className="relative shadow-lg group">
                <img src={previewImage} alt="Cover" className="max-h-[300px] object-contain bg-white rounded-sm border border-slate-300" />
                <div className="absolute -bottom-6 left-0 right-0 text-center text-[10px] text-slate-400">
                    Vorschau Seite 1
                </div>
            </div>
          ) : (
            <div className="text-slate-400 flex flex-col items-center">
                <FileText size={48} className="mb-2 opacity-50"/>
                <span>Keine Vorschau</span>
            </div>
          )}
        </div>

        {/* RECHTE SÄULE: EINGABEN */}
        <div className="w-full md:w-7/12 p-8 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Datei speichern</h2>
                <p className="text-slate-500 text-sm">Geben Sie die Details für das Dokument ein.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-5 flex-1">
            
            {/* Dateiname Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dateiname</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-medium text-slate-700"
                  placeholder="Mein Dokument"
                />
                <FileText className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <span className="absolute right-3 top-3.5 text-slate-400 text-sm font-medium">.pdf</span>
              </div>
            </div>

            {/* Autor Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Autor / Verfasser</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-medium text-slate-700"
                />
                <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 ml-1">* Wird in den PDF-Metadaten hinterlegt.</p>
            </div>

          </div>

          {/* ACTION BUTTONS */}
          <div className="mt-8 space-y-3">
            
            <button 
                onClick={() => handleDownload('quick')}
                className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primaryHover text-white py-3 px-4 rounded-xl font-bold shadow-md shadow-blue-100 hover:shadow-lg hover:shadow-blue-200 transition-all active:scale-[0.98]"
            >
                <Download size={20} />
                In "Downloads" speichern
            </button>

            <button 
                onClick={() => handleDownload('dialog')}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 py-3 px-4 rounded-xl font-bold transition-all active:scale-[0.98]"
            >
                <FolderInput size={20} />
                Speicherort wählen...
            </button>

          </div>

        </div>
      </div>
    </div>
  );
}