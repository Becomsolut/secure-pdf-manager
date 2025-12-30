import { useEffect, useState } from "react";
import {
  Files, Scissors, Image as ImageIcon, PenTool, Minimize2, Lock, AlertCircle,
  
  BotIcon
} from "lucide-react";
import { Merger } from "./features/Merger";
import './App.css'
import { Editor } from "./features/Editor";
import { ImageToPdf } from "./features/ImageToPdf";
import { Signer } from "./features/Signer";
import { Compressor } from "./features/Compressor";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import AiAssistant from "./components/AiAssistent";

// --- Typen & Komponenten für Dashboard ---
type ActionCardProps = {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
};

const ActionCard = ({ title, description, icon: Icon, onClick }: ActionCardProps) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-primary hover:scale-[1.02] transition-all duration-200 group text-left w-full h-full"
  >
    <div className="p-4 bg-slate-50 rounded-full mb-4 group-hover:bg-blue-50 transition-colors">
      <Icon size={40} className="text-slate-600 group-hover:text-primary transition-colors" />
    </div>
    <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
    <p className="text-sm text-slate-500 text-center">{description}</p>
  </button>
);

// --- Haupt App ---
function App() {
  // Navigation State: 'dashboard' | 'merge' | 'edit' ...
  const [currentView, setCurrentView] = useState('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        // Prüft auf GitHub
        const update = await check();
        if (update?.available) {
          const yes = confirm(`Update v${update.version} verfügbar! Installieren & Neustarten?`);
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (e) {
        console.error("Update check failed", e);
      }
    };

    // Check nur im fertigen Build, nicht bei localhost
    if (!window.location.host.includes('localhost')) {
      checkForUpdates();
    }
  }, []);
  // Funktion zum Zurückkehren
  const goHome = () => setCurrentView('dashboard');

  const handleMergerEdit = (mergedFile: File) => {
    setEditorFile(mergedFile);
    setCurrentView('edit'); // Wechselt zum Editor
  };
  return (
    <div className="min-h-screen p-8 flex flex-col items-center max-w-5xl mx-auto">

      {/* Header nur im Dashboard anzeigen */}
      {currentView === 'dashboard' && (
        <header className="mb-10 text-center animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
            Secure PDF Manager
          </h1>
          <p className="text-slate-500">
            Daten bleiben lokal. Einfach, sicher, schnell.
          </p>
        </header>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-5 right-5 bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg flex items-center gap-3 animate-bounce z-50">
          <AlertCircle size={24} />
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-auto font-bold">✕</button>
        </div>
      )}

      {/* --- ANSICHTEN --- */}

      {/* 1. Dashboard Ansicht */}
      {currentView === 'dashboard' && (
        <main className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full animate-in zoom-in-95 duration-300">
          <ActionCard
            title="Zusammenfügen"
            description="Mehrere PDF-Dateien zu einer einzigen verbinden."
            icon={Files}
            onClick={() => setCurrentView('merge')}
          />
          <ActionCard
            title="Seiten bearbeiten"
            description="Seiten löschen, drehen oder neu sortieren."
            icon={Scissors}
            onClick={() => setCurrentView('edit')}
          />
          <ActionCard
            title="AI Agent"
            description="Offline Zusammenfassung und Q&A"
            icon={BotIcon}
            onClick={() => setCurrentView('ai-chat')}
          />

          <ActionCard
            title="Bilder zu PDF"
            description="Fotos in ein PDF-Dokument umwandeln."
            icon={ImageIcon}
            onClick={() => setCurrentView('images')}
          />
          <ActionCard
            title="Unterschreiben"
            description="Dokumente direkt am Bildschirm signieren."
            icon={PenTool}
            onClick={() => setCurrentView('sign')}
          />
          <ActionCard
            title="Verkleinern"
            description="Dateigröße reduzieren."
            icon={Minimize2}
            onClick={() => setCurrentView('compress')}
          />
        </main>
      )}

      {/* 2. Merger Ansicht */}
      {currentView === 'merge' && (
        <Merger onBack={goHome} onEdit={handleMergerEdit} />
      )}
      {currentView === 'edit' && (
        <Editor onBack={goHome} initialFile={editorFile} />
      )}
      {currentView === 'sign' && (
        <Signer onBack={goHome} />
      )}
      {/* 4. Images Ansicht */}
      {currentView === 'images' && (
        <ImageToPdf onBack={goHome} />
      )}
      {currentView === 'compress' && (
        <Compressor onBack={goHome} />
      )}
      {currentView === 'ai-chat' && <AiAssistant onBack={() => setCurrentView('dashboard')} />}

      {/* Footer Sicherheitshinweis (Immer sichtbar) */}
      <footer className="mt-auto pt-12 text-slate-400 text-sm flex items-center gap-2">
        <Lock size={14} />
        <span>Lokaler Datenschutz-Modus aktiv.</span>
      </footer>

    </div>
  );
}

export default App;