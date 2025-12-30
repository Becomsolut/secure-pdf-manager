import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { FileText, Trash2, Download } from 'lucide-react';
import { SaveModal } from '../components/SaveModal';

export function Merger({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Dateien hinzufügen (Duplikate erlaubt)
  const handleAddFiles = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  };

  // Datei aus der Liste entfernen
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Datei in der Liste nach oben/unten schieben (Einfache Version)
  const moveFile = (index: number, direction: -1 | 1) => {
    const newFiles = [...files];
    if (index + direction < 0 || index + direction >= newFiles.length) return;

    const temp = newFiles[index];
    newFiles[index] = newFiles[index + direction];
    newFiles[index + direction] = temp;
    setFiles(newFiles);
  };

  // DIE KERNFUNKTION: PDFs zusammenfügen
  const mergePDFs = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();

      // NEU: Nur Blob erstellen und Modal öffnen
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setCreatedPdfBlob(blob);
      setShowSaveModal(true);

    } catch (err) {
      console.error("Fehler:", err);
      alert("Fehler beim Zusammenfügen.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <SaveModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        pdfBlob={createdPdfBlob}
        defaultFilename="zusammengefuegt.pdf"
      />
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">
          ← Zurück
        </button>
        <h2 className="text-2xl font-bold ml-4 text-slate-800">Dateien zusammenfügen</h2>
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Linke Seite: Upload & Liste */}
        <div className="space-y-4">
          <DropZone onFilesDrop={handleAddFiles} label="Weitere PDFs hinzufügen" />

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-red-50 p-2 rounded text-red-500">
                    <FileText size={20} />
                  </div>
                  <span className="text-sm font-medium truncate max-w-[150px]">{file.name}</span>
                  <span className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveFile(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">↑</button>
                  <button onClick={() => moveFile(idx, 1)} disabled={idx === files.length - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">↓</button>
                  <button onClick={() => removeFile(idx)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <p className="text-center text-slate-400 italic mt-10">Noch keine Dateien ausgewählt.</p>
            )}
          </div>
        </div>

        {/* Rechte Seite: Aktion */}
        <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl p-8 border border-slate-200 text-center">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-700">Bereit zum Heften?</h3>
            <p className="text-slate-500 text-sm mt-1">{files.length} Dateien ausgewählt.</p>
          </div>

          <button
            onClick={mergePDFs}
            disabled={files.length < 2 || isProcessing}
            className={`
              flex items-center gap-3 px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-all
              ${files.length < 2
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-primary hover:bg-primaryHover hover:scale-105 active:scale-95'}
            `}
          >
            {isProcessing ? 'Verarbeite...' : (
              <>
                <Download size={24} />
                PDF erstellen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}