import { useEffect, useState, useMemo, memo } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { DropZone } from '../components/DropZone';
import { renderPdfToImages } from '../utils/pdfRenderer';
import { SaveModal } from '../components/SaveModal';
import { RotateCw, Trash2, Save, Undo, ArrowLeft, ArrowRight, Loader2, GripVertical } from 'lucide-react';

// --- DND KIT IMPORTS (KORRIGIERT) ---
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay, 
  defaultDropAnimationSideEffects,
  DropAnimation
} from '@dnd-kit/core';

import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  // animateLayoutChanges wird nicht importiert, da wir defaultAnimateLayoutChanges nutzen
  defaultAnimateLayoutChanges, 
} from '@dnd-kit/sortable';

import { CSS } from '@dnd-kit/utilities';

// --- TYPES ---

type PageState = {
  id: string;            
  originalIndex: number; 
  rotation: number;      
  isDeleted: boolean;    
  imageSrc: string;      
};

interface EditorProps {
  onBack: () => void;
  initialFile?: File | null; 
}

// --- 1. UI-KOMPONENTE: PAGE CARD (Dumm & Visuell) ---
// Diese Komponente wird sowohl im Grid als auch im DragOverlay genutzt.

interface PageCardProps {
    page: PageState;
    index: number;
    total: number;
    isOverlay?: boolean; 
    onRotate?: () => void;
    onDelete?: () => void;
    onMoveLeft?: () => void;
    onMoveRight?: () => void;
}

const PageCard = ({ page, index, total, isOverlay, onRotate, onDelete, onMoveLeft, onMoveRight }: PageCardProps) => {
    return (
        <div 
          className={`relative group bg-white rounded-lg transition-all duration-200 border-2 flex flex-col h-full
            ${page.isDeleted ? 'opacity-50 border-red-200 bg-red-50' : 'border-transparent hover:border-blue-300'}
            ${isOverlay ? 'shadow-2xl scale-105 border-blue-500 cursor-grabbing' : 'shadow-sm'}
          `}
        >
          {/* Bild Bereich */}
          <div className="aspect-[1/1.4] w-full overflow-hidden rounded-t-lg bg-slate-200 relative cursor-grab active:cursor-grabbing">
            <img 
              src={page.imageSrc} 
              alt={`Seite ${index + 1}`}
              draggable={false} 
              // pointer-events-none ist wichtig für Performance während Drag
              className="w-full h-full object-contain select-none pointer-events-none" 
              style={{ transform: `rotate(${page.rotation}deg)` }} 
            />
            
            {page.isDeleted && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-100/50 backdrop-blur-[1px]">
                <Trash2 size={40} className="text-red-600" />
              </div>
            )}
    
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 p-1 rounded text-white">
                <GripVertical size={16} />
            </div>
          </div>
    
          {/* Footer Controls */}
          <div className="p-2 flex items-center justify-between bg-white rounded-b-lg border-t border-slate-100 mt-auto">
            <span className="text-xs font-bold text-slate-400 w-6 select-none">{index + 1}</span>
            
            {/* stopPropagation verhindert, dass Klicks auf Buttons einen Drag starten */}
            <div className="flex gap-1" onPointerDown={(e) => e.stopPropagation()}> 
              <button onClick={onMoveLeft} disabled={index === 0} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowLeft size={16}/></button>
              <button onClick={onRotate} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-slate-500"><RotateCw size={16}/></button>
              <button onClick={onDelete} className={`p-1.5 rounded transition-colors ${page.isDeleted ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 hover:text-red-500 text-slate-500'}`}>
                {page.isDeleted ? <Undo size={16}/> : <Trash2 size={16}/>}
              </button>
              <button onClick={onMoveRight} disabled={index === total - 1} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowRight size={16}/></button>
            </div>
          </div>
        </div>
      );
}

// --- 2. LOGIK-KOMPONENTE: SORTABLE PAGE (Der Fix) ---

const SortablePage = memo(function SortablePage(props: PageCardProps & { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
      id: props.id,
      // HIER IST DER FIX:
      // Wir deaktivieren die automatische Layout-Animation während des Sortierens,
      // weil wir das DragOverlay nutzen. Das verhindert das "Zittern".
      animateLayoutChanges: (args) => {
        const { isSorting, wasDragging } = args;
        if (isSorting || wasDragging) {
          return false;
        }
        return defaultAnimateLayoutChanges(args);
      }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Wenn wir draggen, machen wir das Element fast unsichtbar (Ghost),
    // weil das DragOverlay darüber schwebt.
    opacity: isDragging ? 0.3 : 1, 
    touchAction: 'none' 
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full">
        <PageCard {...props} />
    </div>
  );
});


// --- 3. HAUPTKOMPONENTE: EDITOR ---

export function Editor({ onBack, initialFile }: EditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // Für Overlay
  const [isLoading, setIsLoading] = useState(false);
  const [createdPdfBlob, setCreatedPdfBlob] = useState<Blob | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Sensoren: Drag startet erst nach 8px Bewegung
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (initialFile) loadFile(initialFile);
  }, [initialFile]);
  
  const handleFileDrop = async (droppedFiles: File[]) => {
    if (droppedFiles.length > 0) loadFile(droppedFiles[0]);
  };

  const loadFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    try {
      const images = await renderPdfToImages(selectedFile);
      const initialPages = images.map((img, idx) => ({
        id: crypto.randomUUID(), // Unique ID
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

  // State Actions
  const rotatePage = (id: string) => {
    setPages(prev => prev.map(p => p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p));
  };
  const toggleDelete = (id: string) => {
    setPages(prev => prev.map(p => p.id === id ? { ...p, isDeleted: !p.isDeleted } : p));
  };
  const movePage = (index: number, direction: -1 | 1) => {
    const newPages = [...pages];
    if (index + direction < 0 || index + direction >= newPages.length) return;
    [newPages[index], newPages[index + direction]] = [newPages[index + direction], newPages[index]];
    setPages(newPages);
  };

  // Drag Handlers
  const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((p) => p.id === active.id);
        const newIndex = items.findIndex((p) => p.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  };

  // Memoized Overlay Item
  const activePage = useMemo(() => pages.find(p => p.id === activeId), [activeId, pages]);

  // Drop Animation (Fade out)
  const dropAnimation: DropAnimation = {
      sideEffects: defaultDropAnimationSideEffects({
        styles: {
          active: { opacity: '0.4' },
        },
      }),
  };

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
        copiedPage.setRotation(degrees(copiedPage.getRotation().angle + pageState.rotation));
        newPdf.addPage(copiedPage);
      }
      const pdfBytes = await newPdf.save();
      setCreatedPdfBlob(new Blob([pdfBytes as any], { type: 'application/pdf' }));
      setShowSaveModal(true);
    } catch (e) { console.error(e); alert("Fehler beim Speichern"); } 
    finally { setIsLoading(false); }
  };

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 font-medium px-2 py-1">← Zurück</button>
          <h2 className="text-2xl font-bold ml-4 text-slate-800">Seiten bearbeiten</h2>
        </div>
        <DropZone onFilesDrop={handleFileDrop} label="PDF zum Bearbeiten hier ablegen" />
        {isLoading && <div className="text-center mt-10 text-slate-500 flex justify-center gap-2"><Loader2 className="animate-spin" /> Lade Vorschau...</div>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <SaveModal isOpen={showSaveModal} onClose={() => setShowSaveModal(false)} pdfBlob={createdPdfBlob} defaultFilename={`bearbeitet_${file.name}`} />
      
      {/* Header Toolbar */}
      <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button onClick={() => setFile(null)} className="text-slate-500 hover:text-slate-800 font-medium">← Abbrechen</button>
          <span className="font-bold text-slate-700 truncate max-w-[200px]">{file.name}</span>
        </div>
        <button onClick={saveChanges} disabled={isLoading} className="bg-primary hover:bg-primaryHover text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95">
          {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} Speichern
        </button>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-100 rounded-xl border border-slate-200">
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragStart={handleDragStart} 
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {pages.map((page, idx) => (
                        <SortablePage 
                            key={page.id}
                            id={page.id} // Wichtig für memo
                            page={page}
                            index={idx}
                            total={pages.length}
                            onRotate={() => rotatePage(page.id)}
                            onDelete={() => toggleDelete(page.id)}
                            onMoveLeft={() => movePage(idx, -1)}
                            onMoveRight={() => movePage(idx, 1)}
                        />
                    ))}
                </div>
            </SortableContext>

            {/* Drag Overlay für 60FPS Animation */}
            <DragOverlay dropAnimation={dropAnimation}>
                {activeId && activePage ? (
                    <div className="h-full">
                         <PageCard 
                            page={activePage} 
                            index={pages.findIndex(p => p.id === activeId)} 
                            total={pages.length}
                            isOverlay
                         />
                    </div>
                ) : null}
            </DragOverlay>

        </DndContext>
      </div>
    </div>
  );
}