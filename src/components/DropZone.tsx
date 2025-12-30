import { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

type DropZoneProps = {
  onFilesDrop: (files: File[]) => void;
  accept?: string; // z.B. ".pdf"
  label?: string;
};

export function DropZone({ onFilesDrop, accept = ".pdf", label = "PDFs hier ablegen" }: DropZoneProps) {
  
  // Verhindert das Standard-Browser-Verhalten (Datei im Tab öffnen)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Dateien aus dem Event holen
    const droppedFiles = Array.from(e.dataTransfer.files);
    // Filtern nach Dateityp (falls nötig)
    const validFiles = droppedFiles.filter(file => file.name.toLowerCase().endsWith('.pdf'));
    
    if (validFiles.length > 0) {
      onFilesDrop(validFiles);
    }
  }, [onFilesDrop]);

  // Fallback für Klick-Upload
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onFilesDrop(selectedFiles);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50 hover:border-blue-400 transition-colors cursor-pointer group h-64 w-full"
    >
      <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
        <UploadCloud size={48} className="text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
        <span className="text-lg font-medium text-slate-600 group-hover:text-blue-600">
          {label}
        </span>
        <span className="text-sm text-slate-400 mt-2">oder hier klicken zum Auswählen</span>
        
        {/* Der versteckte Input für den Klick */}
        <input 
          type="file" 
          multiple 
          accept={accept} 
          className="hidden" 
          onChange={handleInputChange}
        />
      </label>
    </div>
  );
}