import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { SaveModal } from '../components/SaveModal';
import { PDFThumbnail } from '../components/PDFThumbnail';
// Icons
import { 
  Trash2, 
  Download, 
  Settings2, // Für "Bearbeiten"
  ArrowLeft, 
  ArrowRight,
  Plus,
  Loader2
} from 'lucide-react';

interface MergerProps {
    onBack: () => void;
    // Callback: Wenn User "Bearbeiten" klickt, geben wir das gemergte File nach oben, 
    // damit App.tsx zum Editor wechseln kann.
    onEdit: (mergedFile: File) => void; 
}

export function Merger({ onBack, onEdit }: MergerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Für "PDF erstellen" (Direkt speichern)
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleAddFiles = (newFiles: File[]) => {
    // Filtern nur auf PDFs, zur Sicherheit
    const validPdfs = newFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setFiles(prev => [...prev, ...validPdfs]);
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

  // Helper: Erstellt das gemergte PDF-Dokument im Speicher
  const createMergedDocument = async (): Promise<Uint8Array> => {
    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    return await mergedPdf.save();
  };

  // Aktion 1: "PDF Erstellen" (Direkt Speichern)
  const handleDirectSave = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      const pdfBytes = await createMergedDocument();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setCreatedPdfBlob(blob);
      setShowSaveModal(true);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Zusammenfügen.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Aktion 2: "PDF Bearbeiten" (Übergabe an Editor)
  const handleEdit = async () => {
      if (files.length === 0) return;
      setIsProcessing(true);
      try {
          const pdfBytes = await createMergedDocument();
          // Wir erstellen ein File-Objekt, das wir an den Editor weitergeben
          const file = new File([pdfBytes as any], "merged_temp.pdf", { type: "application/pdf" });
          
          // Callback an Parent (App.tsx)
          onEdit(file);
      } catch (err) {
          console.error(err);
          alert("Fehler beim Vorbereiten des Editors.");
          setIsProcessing(false);
      }
  };

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Modal für "Direkt Speichern" */}
      <SaveModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        pdfBlob={createdPdfBlob}
        defaultFilename="zusammengefuegt.pdf"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1 flex items-center gap-2 transition-colors">
            <ArrowLeft size={20} /> Zurück
            </button>
            <h2 className="text-2xl font-bold ml-4 text-slate-800">Dateien zusammenfügen</h2>
        </div>
        <div className="text-slate-500 text-sm font-medium bg-slate-100 px-3 py-1 rounded-full">
            {files.length} {files.length === 1 ? 'Datei' : 'Dateien'}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start h-[calc(100vh-180px)]">
        
        {/* Linke Seite: Grid-View (Scrollbar) */}
        <div className="flex-1 w-full bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-6 h-full overflow-y-auto min-h-[400px]">
            
            {files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center">
                    <DropZone onFilesDrop={handleAddFiles} label="PDFs hier ablegen" />
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                    {/* Die Dateien */}
                    {files.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                            
                            {/* Preview Area */}
                            <div className="aspect-[1/1.4] bg-slate-100 relative border-b border-slate-100">
                                <PDFThumbnail file={file} className="w-full h-full" />
                                
                                {/* Overlay Controls (nur bei Hover sichtbar) */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[1px]">
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => moveFile(idx, -1)} 
                                            disabled={idx === 0}
                                            className="p-2 bg-white rounded-full hover:bg-slate-100 disabled:opacity-50 text-slate-700 shadow-lg"
                                            title="Nach links / vorne"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                        <button 
                                            onClick={() => moveFile(idx, 1)} 
                                            disabled={idx === files.length - 1}
                                            className="p-2 bg-white rounded-full hover:bg-slate-100 disabled:opacity-50 text-slate-700 shadow-lg"
                                            title="Nach rechts / hinten"
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => removeFile(idx)} 
                                        className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg mt-2"
                                        title="Entfernen"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {/* Seiten-Badge */}
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-bold backdrop-blur-md">
                                    #{idx + 1}
                                </div>
                            </div>

                            {/* Footer Info */}
                            <div className="p-3 bg-white">
                                <p className="text-xs font-bold text-slate-700 truncate mb-1" title={file.name}>{file.name}</p>
                                <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        </div>
                    ))}

                    {/* Add More Button als Kachel */}
                    <div className="aspect-[1/1.4] rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer flex flex-col items-center justify-center group"
                         onClick={() => document.getElementById('hidden-merge-input')?.click()}
                    >
                        <div className="p-3 bg-slate-100 group-hover:bg-blue-100 rounded-full mb-2 text-slate-400 group-hover:text-blue-500 transition-colors">
                            <Plus size={24} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 group-hover:text-blue-600">Hinzufügen</span>
                        
                        {/* Versteckter Input für den Kachel-Klick */}
                        <input 
                            id="hidden-merge-input"
                            type="file" 
                            multiple 
                            accept=".pdf" 
                            className="hidden" 
                            onChange={(e) => {
                                if(e.target.files) handleAddFiles(Array.from(e.target.files));
                                e.target.value = ''; // Reset
                            }} 
                        />
                    </div>
                </div>
            )}
        </div>

        {/* Rechte Seite: Sidebar / Actions */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
            
            {/* Status Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-1">Zusammenfassung</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Sie haben {files.length} Dateien in der Warteschlange.
                </p>

                <div className="space-y-3">
                    {/* Primary Action: Download */}
                    <button
                        onClick={handleDirectSave}
                        disabled={files.length < 2 || isProcessing}
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                        PDF Erstellen
                    </button>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">oder</span></div>
                    </div>

                    {/* Secondary Action: Edit */}
                    <button
                        onClick={handleEdit}
                        disabled={files.length < 2 || isProcessing}
                        className="w-full flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-blue-200 hover:bg-blue-50 text-slate-700 px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isProcessing ? <Loader2 className="animate-spin text-slate-400" size={20} /> : <Settings2 size={20} className="text-slate-400 group-hover:text-blue-500" />}
                        <span>Zusammenfügen & Bearbeiten</span>
                    </button>
                    
                    <p className="text-xs text-center text-slate-400 mt-2 px-2">
                        "Bearbeiten" öffnet den Editor, um Seiten zu löschen, drehen oder neu zu sortieren.
                    </p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}