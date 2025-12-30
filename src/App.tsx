import { useEffect, useState } from "react";
import {
  Files, Scissors, Image as ImageIcon, PenTool, Minimize2, Lock, AlertCircle
} from "lucide-react";
import { Merger } from "./features/Merger";
import './App.css'
import { Editor } from "./features/Editor";
import { ImageToPdf } from "./features/ImageToPdf";
import { Signer } from "./features/Signer";
import { Protector } from "./features/Protector";
import { Compressor } from "./features/Compressor";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

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

// --- Haupt App ---
function App() {
  // Navigation State: 'dashboard' | 'merge' | 'edit' ...
  const [currentView, setCurrentView] = useState('dashboard');
  const [error, setError] = useState<string | null>(null);

  // Funktion zum Zurückkehren
  const goHome = () => setCurrentView('dashboard');

  return (
    <div className="min-h-screen p-8 flex flex-col items-center max-w-5xl mx-auto">

      {/* Header nur im Dashboard anzeigen */}
      {currentView === 'dashboard' && (
        <header className="mb-10 text-center animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
            Sicherer PDF Editor
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
          <ActionCard
            title="Schützen"
            description="Passwort hinzufügen."
            icon={Lock}
            onClick={() => setCurrentView('protect')}
          />
        </main>
      )}

      {/* 2. Merger Ansicht */}
      {currentView === 'merge' && (
        <Merger onBack={goHome} />
      )}
      {currentView === 'edit' && (
        <Editor onBack={goHome} />
      )}
      {currentView === 'sign' && (
        <Signer onBack={goHome} />
      )}
      {/* 4. Images Ansicht */}
      {currentView === 'images' && (
        <ImageToPdf onBack={goHome} />
      )}
      {currentView === 'protect' && (
        <Protector onBack={goHome} />
      )}
      {currentView === 'compress' && (
        <Compressor onBack={goHome} />
      )}

      {/* Footer Sicherheitshinweis (Immer sichtbar) */}
      <footer className="mt-auto pt-12 text-slate-400 text-sm flex items-center gap-2">
        <Lock size={14} />
        <span>Lokaler Datenschutz-Modus aktiv.</span>
      </footer>

    </div>
  );
}

export default App;