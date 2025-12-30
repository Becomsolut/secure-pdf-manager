import { useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { renderPdfToImages } from '../utils/pdfRenderer';
import { SaveModal } from '../components/SaveModal';
import { RotateCw, Trash2, Save, Undo, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

type PageState = {
  originalIndex: number; // Wo war die Seite im Original?
  rotation: number;      // 0, 90, 180, 270
  isDeleted: boolean;    // Soll sie gelöscht werden?
  imageSrc: string;      // Das Vorschaubild
};

export function Editor({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // 1. Datei laden und rendern
  const handleFileDrop = async (droppedFiles: File[]) => {
    if (droppedFiles.length === 0) return;
    const selectedFile = droppedFiles[0]; // Wir bearbeiten hier nur eine Datei auf einmal
    setFile(selectedFile);
    setIsLoading(true);

    try {
      const images = await renderPdfToImages(selectedFile);
      
      // Initialer Zustand für alle Seiten erstellen
      const initialPages = images.map((img, idx) => ({
        originalIndex: idx,
        rotation: 0,
        isDeleted: false,
        imageSrc: img
      }));
      
      setPages(initialPages);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Laden der PDF-Vorschau.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Aktionen (Drehen, Löschen, Verschieben)
  const rotatePage = (index: number) => {
    const newPages = [...pages];
    newPages[index].rotation = (newPages[index].rotation + 90) % 360;
    setPages(newPages);
  };

  const toggleDelete = (index: number) => {
    const newPages = [...pages];
    newPages[index].isDeleted = !newPages[index].isDeleted;
    setPages(newPages);
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const newPages = [...pages];
    if (index + direction < 0 || index + direction >= newPages.length) return;
    
    // Tauschen
    const temp = newPages[index];
    newPages[index] = newPages[index + direction];
    newPages[index + direction] = temp;
    setPages(newPages);
  };

  // 3. Speichern (Anwenden der Änderungen)
  const saveChanges = async () => {
    if (!file) return;
    setIsLoading(true);

    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const newPdf = await PDFDocument.create();

      for (const pageState of pages) {
        if (pageState.isDeleted) continue; 
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageState.originalIndex]);
        const existingRotation = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees(existingRotation + pageState.rotation));
        newPdf.addPage(copiedPage);
      }

      const pdfBytes = await newPdf.save();
      
      // NEU: Blob erstellen und Modal öffnen statt direkt Download
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setCreatedPdfBlob(blob);
      setShowSaveModal(true);

    } catch (error) {
      console.error(error);
      alert("Fehler beim Speichern.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI RENDER ---

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
         <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">Seiten bearbeiten</h2>
        </div>
        <DropZone onFilesDrop={handleFileDrop} label="PDF zum Bearbeiten hier ablegen" />
        {isLoading && <div className="text-center mt-10 text-slate-500 flex justify-center gap-2"><Loader2 className="animate-spin"/> Lade Vorschau...</div>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      {/* Toolbar */}
      <SaveModal 
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        pdfBlob={createdPdfBlob}
        defaultFilename={`bearbeitet_${file.name}`}
      />
      <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button onClick={() => setFile(null)} className="text-slate-500 hover:text-slate-800 font-medium">
            ← Abbrechen
          </button>
          <span className="font-bold text-slate-700 truncate max-w-[200px]">{file.name}</span>
        </div>
        
        <button 
          onClick={saveChanges}
          disabled={isLoading}
          className="bg-primary hover:bg-primaryHover text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
        >
          {isLoading ? <Loader2 className="animate-spin"/> : <Save size={20} />}
          Speichern
        </button>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-100 rounded-xl border border-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          
          {pages.map((page, idx) => (
            <div 
              key={idx} 
              className={`relative group bg-white rounded-lg shadow-sm transition-all duration-200 border-2
                ${page.isDeleted ? 'opacity-50 border-red-200 bg-red-50' : 'border-transparent hover:border-blue-300'}
              `}
            >
              {/* Image Container */}
              <div className="aspect-[1/1.4] w-full overflow-hidden rounded-t-lg bg-slate-200 relative">
                <img 
                  src={page.imageSrc} 
                  alt={`Seite ${idx + 1}`}
                  className="w-full h-full object-contain transition-transform duration-300"
                  style={{ transform: `rotate(${page.rotation}deg)` }} 
                />
                
                {/* Deleted Overlay */}
                {page.isDeleted && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-100/50 backdrop-blur-[1px]">
                    <Trash2 size={40} className="text-red-600" />
                  </div>
                )}
              </div>

              {/* Controls Footer */}
              <div className="p-2 flex items-center justify-between bg-white rounded-b-lg border-t border-slate-100">
                <span className="text-xs font-bold text-slate-400 w-6">{idx + 1}</span>
                
                <div className="flex gap-1">
                  <button onClick={() => movePage(idx, -1)} disabled={idx === 0} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowLeft size={16}/></button>
                  <button onClick={() => rotatePage(idx)} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-slate-500"><RotateCw size={16}/></button>
                  <button 
                    onClick={() => toggleDelete(idx)} 
                    className={`p-1.5 rounded transition-colors ${page.isDeleted ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 hover:text-red-500 text-slate-500'}`}
                  >
                    {page.isDeleted ? <Undo size={16}/> : <Trash2 size={16}/>}
                  </button>
                  <button onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowRight size={16}/></button>
                </div>
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}