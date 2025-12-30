import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { SignaturePad } from '../components/SignaturePad';
import { renderPdfToImages } from '../utils/pdfRenderer';
import { SaveModal } from '../components/SaveModal';
import { PenTool, ChevronLeft, ChevronRight, Loader2, Save, XCircle } from 'lucide-react';

// Typ für eine platzierte Unterschrift
type PlacedSignature = {
  id: number;
  pageIndex: number;
  relX: number; // Prozentuale Position X (0.0 - 1.0)
  relY: number; // Prozentuale Position Y (0.0 - 1.0)
  dataUrl: string;
};

export function Signer({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [currentSignatureUrl, setCurrentSignatureUrl] = useState<string | null>(null);
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  // Liste aller Unterschriften auf dem Dokument
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);
  
  const [isStampMode, setIsStampMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);

  // 1. Datei laden
  const handleFileDrop = async (files: File[]) => {
    if (files.length === 0) return;
    setFile(files[0]);
    setIsProcessing(true);
    try {
      const imgs = await renderPdfToImages(files[0]);
      setPageImages(imgs);
      setCurrentPage(0);
      setPlacedSignatures([]); // Reset bei neuer Datei
    } catch (e) {
      console.error(e);
      alert("Fehler beim Laden der PDF-Vorschau.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Unterschrift erstellt -> In den "Stempel-Modus"
  const handleSignatureCreated = (dataUrl: string) => {
    setCurrentSignatureUrl(dataUrl);
    setShowSignaturePad(false);
    setIsStampMode(true);
  };

  // 3. Auf PDF klicken -> Unterschrift VORLÄUFIG platzieren (Visuell)
  const handlePdfClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isStampMode || !currentSignatureUrl || !imageRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; 
    const y = e.clientY - rect.top;

    // Wir speichern die Position in Prozent, damit es auch bei Fenstergröße-Änderung passt
    const relX = x / rect.width;
    const relY = y / rect.height;

    const newSig: PlacedSignature = {
      id: Date.now(),
      pageIndex: currentPage,
      relX,
      relY,
      dataUrl: currentSignatureUrl
    };

    setPlacedSignatures(prev => [...prev, newSig]);
    
    // Wir bleiben im Stempel-Modus, falls man mehrmals klicken will.
    // Wer fertig ist, klickt oben auf "Speichern".
  };

  // Hilfsfunktion: Eine platzierte Unterschrift wieder löschen
  const removeSignature = (id: number) => {
    setPlacedSignatures(prev => prev.filter(sig => sig.id !== id));
  };

  // 4. FINALISIEREN: PDF berechnen und speichern
  const handleSavePdf = async () => {
    if (!file || placedSignatures.length === 0) return;
    setIsProcessing(true);

    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      
      for (const sig of placedSignatures) {
        const page = pdfDoc.getPage(sig.pageIndex);
        const { width, height } = page.getSize();
        const signatureBytes = await fetch(sig.dataUrl).then(res => res.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(signatureBytes);
        const signWidth = width * 0.25; 
        const signHeight = signWidth * (pngImage.height / pngImage.width);
        const pdfX = (sig.relX * width) - (signWidth / 2);
        const pdfY = height - (sig.relY * height) - (signHeight / 2);

        page.drawImage(pngImage, { x: pdfX, y: pdfY, width: signWidth, height: signHeight });
      }

      const pdfBytes = await pdfDoc.save();
      
      // NEU: Blob + Modal
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setCreatedPdfBlob(blob);
      setShowSaveModal(true);

    } catch (err) {
      console.error(err);
      alert("Fehler beim Speichern.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
         <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">Unterschreiben</h2>
        </div>
        <DropZone onFilesDrop={handleFileDrop} label="PDF zum Signieren laden" />
        {isProcessing && <div className="text-center mt-10 text-slate-500 flex justify-center gap-2"><Loader2 className="animate-spin"/> Lade Vorschau...</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] w-full max-w-6xl mx-auto">
      <SaveModal 
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        pdfBlob={createdPdfBlob}
        defaultFilename={`signiert_${file.name}`}
      />
      {/* Header Toolbar */}
      <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setFile(null)} className="text-slate-500 hover:text-slate-800 font-medium">← Schließen</button>
          
          <div className="flex items-center gap-2 select-none bg-slate-100 rounded-lg p-1">
            <button 
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))} 
              disabled={currentPage === 0}
              className="p-1 hover:bg-white shadow-sm rounded disabled:opacity-30 disabled:shadow-none transition-all"
            >
              <ChevronLeft size={20}/>
            </button>
            <span className="text-sm font-medium w-24 text-center">Seite {currentPage + 1} / {pageImages.length}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))} 
              disabled={currentPage === pageImages.length - 1}
              className="p-1 hover:bg-white shadow-sm rounded disabled:opacity-30 disabled:shadow-none transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
            {/* Action Buttons */}
            {currentSignatureUrl ? (
                <button 
                    onClick={() => setIsStampMode(!isStampMode)}
                    className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border
                    ${isStampMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700'}`}
                >
                    <PenTool size={18} />
                    {isStampMode ? 'Stempel aktiv' : 'Stempel aktivieren'}
                </button>
            ) : (
                <button 
                    onClick={() => setShowSignaturePad(true)}
                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                    <PenTool size={18} />
                    Unterschrift erstellen
                </button>
            )}

            <div className="w-px h-8 bg-slate-200 mx-2"></div>

            <button 
                onClick={handleSavePdf}
                disabled={placedSignatures.length === 0}
                className="bg-primary hover:bg-primaryHover disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
            >
                {isProcessing ? <Loader2 className="animate-spin"/> : <Save size={20} />}
                PDF Speichern
            </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 bg-slate-200/50 rounded-xl overflow-auto relative flex items-start justify-center p-8 border border-slate-200">
        
        {pageImages.length > 0 && (
            <div className="relative shadow-xl inline-block">
                
                {/* 1. Das PDF Bild */}
                <img 
                    ref={imageRef}
                    src={pageImages[currentPage]} 
                    alt="PDF Page" 
                    onClick={handlePdfClick}
                    className={`max-w-full h-auto max-h-[75vh] bg-white transition-all duration-200 select-none
                      ${isStampMode ? 'cursor-crosshair ring-4 ring-blue-400/30' : ''}
                    `}
                    draggable={false}
                />

                {/* 2. Die platzierten Unterschriften (Overlay) */}
                {placedSignatures.map((sig) => {
                    // Nur Signaturen der aktuellen Seite anzeigen
                    if (sig.pageIndex !== currentPage) return null;

                    return (
                        <div 
                            key={sig.id}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                            style={{ 
                                left: `${sig.relX * 100}%`, 
                                top: `${sig.relY * 100}%`,
                                width: '25%', // Visuelle Größe passend zur PDF-Logik
                            }}
                        >
                            <img src={sig.dataUrl} alt="Signature" className="w-full drop-shadow-md" />
                            
                            {/* Löschen Button (erscheint bei Hover) */}
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation(); // Verhindert neues Stempeln
                                    removeSignature(sig.id);
                                }}
                                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110"
                                title="Entfernen"
                            >
                                <XCircle size={16} />
                            </button>
                        </div>
                    );
                })}
                
                {/* Hinweis im Stamp Mode */}
                {isStampMode && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-none z-10">
                        Klicken zum Stempeln
                    </div>
                )}
            </div>
        )}

      </div>

      {/* Modals */}
      {showSignaturePad && (
        <SignaturePad 
            onConfirm={handleSignatureCreated} 
            onCancel={() => setShowSignaturePad(false)} 
        />
      )}
      
      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 z-[60] flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 size={40} className="animate-spin text-primary mb-2"/>
            <p className="text-xl font-bold text-slate-700">Verarbeite...</p>
        </div>
      )}

    </div>
  );
}