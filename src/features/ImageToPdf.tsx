import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { SaveModal } from '../components/SaveModal';
import { FileImage, Trash2, Download, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';

export function ImageToPdf({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Filtert Nicht-Bilder heraus
  const handleDrop = (droppedFiles: File[]) => {
    const imageFiles = droppedFiles.filter(f => 
      f.type === 'image/jpeg' || f.type === 'image/png' || f.name.toLowerCase().endsWith('.jpg') || f.name.toLowerCase().endsWith('.png')
    );
    
    if (imageFiles.length < droppedFiles.length) {
      alert("Hinweis: Nur JPG und PNG Dateien werden unterstützt.");
    }
    
    setFiles(prev => [...prev, ...imageFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const newFiles = [...files];
    if (index + direction < 0 || index + direction >= newFiles.length) return;
    const temp = newFiles[index];
    newFiles[index] = newFiles[index + direction];
    newFiles[index + direction] = temp;
    setFiles(newFiles);
  };

  // KERNFUNKTION: Bilder einbetten & skalieren
  const createPdf = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      
      for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        let image;
        try {
            if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
                image = await pdfDoc.embedJpg(fileBuffer);
            } else {
                image = await pdfDoc.embedPng(fileBuffer);
            }
        } catch (e) { continue; }

        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        const margin = 40;
        const availableWidth = width - (margin * 2);
        const availableHeight = height - (margin * 2);
        const imgDims = image.scaleToFit(availableWidth, availableHeight);

        page.drawImage(image, {
          x: (width / 2) - (imgDims.width / 2),
          y: (height / 2) - (imgDims.height / 2),
          width: imgDims.width,
          height: imgDims.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      
      // NEU: Blob + Modal
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setCreatedPdfBlob(blob);
      setShowSaveModal(true);

    } catch (err) {
      console.error(err);
      alert("Fehler beim Erstellen des PDFs.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">
          ← Zurück
        </button>
        <h2 className="text-2xl font-bold ml-4 text-slate-800">Bilder zu PDF</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Linke Spalte: Input & Liste */}
        <div className="space-y-4">
          <DropZone onFilesDrop={handleDrop} accept="image/*" label="Bilder (JPG, PNG) hier ablegen" />
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-purple-50 p-2 rounded text-purple-500">
                    <FileImage size={20} />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-sm font-medium truncate max-w-[150px]">{file.name}</span>
                    <span className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveFile(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"><ArrowUp size={16}/></button>
                  <button onClick={() => moveFile(idx, 1)} disabled={idx === files.length - 1} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"><ArrowDown size={16}/></button>
                  <button onClick={() => removeFile(idx)} className="p-1 hover:bg-red-50 text-red-400 hover:text-red-500 rounded"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <p className="text-center text-slate-400 italic mt-10">Liste ist leer.</p>
            )}
          </div>
        </div>

        {/* Rechte Spalte: Info & Action */}
        <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl p-8 border border-slate-200 text-center h-full min-h-[300px]">
          <div className="mb-6 max-w-xs">
            <h3 className="text-lg font-bold text-slate-700">Einstellungen</h3>
            <p className="text-slate-500 text-sm mt-2">
              Die Bilder werden automatisch zentriert und auf A4-Format skaliert.
            </p>
            <div className="mt-4 bg-white p-4 rounded border border-slate-200 text-xs text-left text-slate-500">
                <p>• Format: <strong>A4</strong></p>
                <p>• Ausrichtung: <strong>Portrait</strong></p>
                <p>• Seitenanzahl: <strong>{files.length}</strong></p>
            </div>
          </div>

          <button
            onClick={createPdf}
            disabled={files.length === 0 || isProcessing}
            className={`
              flex items-center gap-3 px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-all
              ${files.length === 0 
                ? 'bg-slate-300 cursor-not-allowed' 
                : 'bg-primary hover:bg-primaryHover hover:scale-105 active:scale-95'}
            `}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Download size={24} />}
            {isProcessing ? 'Erstelle PDF...' : 'PDF Erstellen'}
          </button>
        </div>
      </div>
      <SaveModal 
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        pdfBlob={createdPdfBlob}
        defaultFilename="foto_mappe.pdf"
      />
    </div>
  );
}