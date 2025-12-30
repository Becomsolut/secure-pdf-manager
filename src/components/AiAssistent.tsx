import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";
import { Bot, FileText, Send, Loader2, Upload, AlertCircle, ArrowLeft, Cpu, Zap, BrainCircuit } from 'lucide-react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- TYPE FIX FÜR WEBGPU ---
declare global {
    interface Navigator {
        gpu: any;
    }
}

// --- MODEL CONFIGURATION ---
type ModelConfig = {
    id: string;
    name: string;
    contextChars: number; // Wie viel Text (Zeichen) darf rein?
    desc: string;
};

const MODELS: Record<string, ModelConfig> = {
    LOW_RES: {
        id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
        name: "Phi-3 Mini",
        contextChars: 6000, // Konservativ für 4k Tokens
        desc: "Schnell & Leicht (für Geräte < 16GB RAM)"
    },
    HIGH_RES: {
        id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
        name: "Llama 3.1 8B",
        contextChars: 24000, // Llama 3.1 packt locker mehr, wir nutzen das RAM aus!
        desc: "Maximale Intelligenz (für M-Series Macs & starke PCs)"
    }
};

type AppState = 'HARDWARE_CHECK' | 'INITIAL_LOAD' | 'READY_UPLOAD' | 'ANALYZING' | 'CHAT' | 'ERROR';

type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

interface AiAssistantProps {
    onBack: () => void;
}

export default function AiAssistant({ onBack }: AiAssistantProps) {
    const [appState, setAppState] = useState<AppState>('HARDWARE_CHECK');

    // Model State
    const [selectedModel, setSelectedModel] = useState<ModelConfig>(MODELS.LOW_RES);
    const [ramInfo, setRamInfo] = useState<string>("");

    const [engine, setEngine] = useState<MLCEngine | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<string>('Initialisiere...');
    const [loadingPercent, setLoadingPercent] = useState(0);

    // Chat Data
    const [pdfText, setPdfText] = useState<string>("");
    const [truncatedText, setTruncatedText] = useState<string>("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- 1. Hardware Check & Engine Init ---
    useEffect(() => {
        const startUp = async () => {
            try {
                if (!navigator.gpu) throw new Error("WebGPU nicht unterstützt.");

                // A. RAM Check via Rust
                // sysinfo gibt Bytes zurück. / 1024^3 = GB
                const totalBytes = await invoke<number>('get_total_memory');
                const gb = Math.round(totalBytes / (1024 * 1024 * 1024));

                let chosen = MODELS.LOW_RES;
                if (gb > 16) {
                    chosen = MODELS.HIGH_RES;
                    setRamInfo(`${gb} GB RAM erkannt -> High Performance Mode`);
                } else {
                    setRamInfo(`${gb} GB RAM erkannt -> Standard Mode`);
                }

                setSelectedModel(chosen);
                setAppState('INITIAL_LOAD');

                // B. Engine laden
                const initProgressCallback: InitProgressCallback = (report) => {
                    setDownloadProgress(report.text);
                    const match = report.text.match(/\[(\d+)\/(\d+)\]/);
                    if (match) {
                        const current = parseInt(match[1]);
                        const total = parseInt(match[2]);
                        setLoadingPercent((current / total) * 100);
                    }
                };

                const engineInstance = await CreateMLCEngine(
                    chosen.id,
                    {
                        initProgressCallback,
                        // initProgressCallbackThrottle: 100  <-- DIESE ZEILE LÖSCHEN
                    }
                );

                setEngine(engineInstance);
                setAppState('READY_UPLOAD');

            } catch (error) {
                console.error("Startup Error:", error);
                setAppState('ERROR');
            }
        };

        startUp();
    }, []);

    // --- 2. Auto-Scroll ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- 3. File Upload & Analyse ---
    const handleFileUpload = async () => {
        if (!engine) return;

        try {
            const selected = await openFileDialog({
                multiple: false,
                filters: [{ name: 'PDF Dokument', extensions: ['pdf'] }]
            });

            if (selected === null) return;
            const filePath = Array.isArray(selected) ? selected[0] : selected;

            setAppState('ANALYZING');
            setMessages([]);

            const fullText = await invoke<string>('extract_text', { filePath });

            console.log("------------------------------------------------");
            console.log("Extrahierte Text-Länge:", fullText.length);
            console.log("Vorschau (erste 100 Zeichen):", fullText.slice(0, 100));
            console.log("------------------------------------------------");

            if (fullText.trim().length === 0) {
                alert("ACHTUNG: Kein Text gefunden! Ist das PDF eingescannt (Bild)? Dieses Tool unterstützt aktuell keine OCR.");
                setAppState('READY_UPLOAD'); // Reset
                return;
            }

            console.log("Original Text:", fullText.length);
            console.log("Model Limit:", selectedModel.contextChars);

            // DYNAMISCHES KÜRZEN
            let safeText = fullText;
            if (fullText.length > selectedModel.contextChars) {
                safeText = fullText.slice(0, selectedModel.contextChars);
                safeText += `\n\n[... Text gekürzt. Limit für ${selectedModel.name} erreicht ...]`;
            }

            setPdfText(fullText);
            setTruncatedText(safeText);

            const systemMessage: Message = {
                role: "system",
                content: "Du bist ein hilfreicher Assistent. Antworte nur basierend auf diesem Kontext:\n\n" + safeText
            };

            const summaryPrompt: Message = {
                role: "user",
                content: "Fasse dieses Dokument in 3-5 wichtigen Stichpunkten zusammen (Deutsch)."
            };

            setMessages([summaryPrompt]);

            const chunks = await engine.chat.completions.create({
                messages: [systemMessage, summaryPrompt],
                stream: true,
                temperature: 0.3,
                max_tokens: 600
            });

            let fullResponse = "";
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            for await (const chunk of chunks) {
                const content = chunk.choices[0]?.delta?.content || "";
                fullResponse += content;
                setMessages(prev => {
                    const newMsg = [...prev];
                    newMsg[newMsg.length - 1].content = fullResponse;
                    return newMsg;
                });
            }

            setAppState('CHAT');

        } catch (err) {
            console.error("Analyse Fehler:", err);
            setMessages(prev => [...prev, { role: 'assistant', content: `Fehler: ${err}` }]);
            setAppState('CHAT');
        }
    };

    // --- 4. Chat Funktion ---
    const handleSendMessage = async () => {
        if (!input.trim() || isGenerating || !engine) return;

        // Wir bauen den Kontext direkt in die User-Message ein, 
        // das ist für kleine Modelle "sichtbarer".
        const contextInjection = `
NUTZE DIESEN HINTERGRUND-TEXT UM DIE FRAGE ZU BEANTWORTEN:
"""
${truncatedText}
"""

FRAGE DES NUTZERS:
${input}
`;

        // Für die Anzeige im Chat wollen wir nur die kurze Frage sehen, 
        // aber an die Engine schicken wir den vollen Block.
        const visibleUserMsg: Message = { role: 'user', content: input };
        const technicalUserMsg: Message = { role: 'user', content: contextInjection };

        setMessages(prev => [...prev, visibleUserMsg]);
        setInput("");
        setIsGenerating(true);

        try {
            // System Prompt jetzt sehr generisch halten
            const systemMsg: Message = {
                role: "system",
                content: "Du bist ein präziser Assistent. Antworte nur basierend auf dem gegebenen Kontexttext. Erfinde keine Fakten."
            };

            // History zusammenbauen:
            // Wir nehmen die alten Nachrichten (für den Chat-Fluss), 
            // aber ersetzen die letzte User-Nachricht durch unsere "Technical Message" mit Kontext.
            const history = [
                systemMsg,
                ...messages.slice(-4), // Nur die letzten paar Nachrichten für Konversation
                technicalUserMsg       // Die aktuelle Frage MIT Kontext
            ];

            const chunks = await engine.chat.completions.create({
                messages: history,
                stream: true,
                temperature: 0.1, // WICHTIG: Kreativität senken, damit es bei Fakten bleibt
            });

            let fullResponse = "";
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            for await (const chunk of chunks) {
                const content = chunk.choices[0]?.delta?.content || "";
                fullResponse += content;
                setMessages(prev => {
                    const newMsg = [...prev];
                    newMsg[newMsg.length - 1].content = fullResponse;
                    return newMsg;
                });
            }

        } catch (error) {
            console.error("Chat Error:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    // --- RENDERER ---

    return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-800 animate-in fade-in">

            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <Bot className="text-blue-600" /> Smart Analyse
                        </h2>
                    </div>
                </div>

                {/* Model Info Badge */}
                {appState !== 'HARDWARE_CHECK' && (
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                            {selectedModel === MODELS.HIGH_RES ? <BrainCircuit size={14} className="text-purple-600" /> : <Zap size={14} className="text-orange-500" />}
                            {selectedModel.name}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 font-mono">{ramInfo}</span>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col items-center justify-center p-6 relative">

                {/* STATE: HARDWARE CHECK */}
                {appState === 'HARDWARE_CHECK' && (
                    <div className="text-center animate-pulse">
                        <Cpu size={48} className="text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 font-medium">Prüfe Systemressourcen...</p>
                    </div>
                )}

                {/* STATE: INITIAL LOADING */}
                {appState === 'INITIAL_LOAD' && (
                    <div className="text-center max-w-md w-full animate-in zoom-in-95 duration-500">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                            {selectedModel === MODELS.HIGH_RES ? 'High-Res AI wird geladen' : 'AI Modell wird geladen'}
                        </h3>
                        <p className="text-slate-500 text-sm mb-6">
                            {selectedModel === MODELS.HIGH_RES
                                ? 'Wir laden Llama 3 (ca. 4-5GB). Das dauert beim ersten Mal etwas länger, lohnt sich aber!'
                                : 'Lade Phi-3 Mini (ca. 2GB).'}
                        </p>
                        <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2 overflow-hidden">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${loadingPercent}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-slate-400 font-mono truncate">{downloadProgress}</p>
                    </div>
                )}

                {/* STATE: READY TO UPLOAD */}
                {appState === 'READY_UPLOAD' && (
                    <div
                        onClick={handleFileUpload}
                        className="text-center border-2 border-dashed border-slate-300 rounded-xl p-16 hover:bg-white hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer relative group max-w-lg w-full"
                    >
                        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                            <Upload size={36} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-700">PDF zum Analysieren wählen</h3>
                        <p className="text-slate-500 mt-2">
                            Kontext-Limit: <span className="font-bold text-slate-700">~{Math.round(selectedModel.contextChars / 4)} Wörter</span>
                        </p>

                        <div className="mt-8 flex justify-center gap-3">
                            <span className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium border border-green-100">
                                🔒 100% Offline
                            </span>
                            {selectedModel === MODELS.HIGH_RES && (
                                <span className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full font-medium border border-purple-100 flex items-center gap-1">
                                    <BrainCircuit size={12} /> M4 Optimized
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* STATE: ANALYZING */}
                {appState === 'ANALYZING' && (
                    <div className="text-center animate-pulse">
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <FileText className="w-20 h-20 text-slate-200" />
                            <div className="absolute bottom-0 right-0 bg-white p-1 rounded-full shadow-md">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Analysiere Dokument...</h3>
                        <p className="text-slate-500 mt-2 max-w-xs mx-auto">
                            Verarbeite Text mit {selectedModel.name}...
                        </p>
                    </div>
                )}

                {/* STATE: ERROR */}
                {appState === 'ERROR' && (
                    <div className="text-center text-red-500 bg-red-50 p-8 rounded-xl border border-red-100 max-w-md">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                        <h3 className="text-lg font-bold mb-2">Fehler beim Starten</h3>
                        <p className="text-sm mb-4">
                            Dein Browser unterstützt evtl. kein WebGPU oder der Speicherplatz reicht nicht aus.
                        </p>
                        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                            Neu laden
                        </button>
                    </div>
                )}

                {/* STATE: CHAT */}
                {appState === 'CHAT' && (
                    <div className="w-full h-full flex flex-col max-w-5xl bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-4">

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 scroll-smooth">

                            {pdfText.length > selectedModel.contextChars && (
                                <div className="flex justify-center">
                                    <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-full">
                                        ⚠️ Dokument war selbst für Llama zu lang. Text gekürzt.
                                    </span>
                                </div>
                            )}

                            {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                                <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? selectedModel === MODELS.HIGH_RES ? 'bg-purple-600 text-white rounded-br-none' : 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                                    }`}>

                                    {/* LOADING STATE */}
                                    {!msg.content && <div className="animate-pulse">...</div>}

                                    {/* CONTENT RENDERING */}
                                    {msg.content && (
                                        msg.role === 'assistant' ? (
                                            /* ASSISTANT: MARKDOWN RENDERER */
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    // Wir stylen die HTML Elemente manuell mit Tailwind Klassen
                                                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                                                    strong: ({ node, ...props }) => <strong className="font-bold text-slate-900" {...props} />,
                                                    h1: ({ node, ...props }) => <h1 className="text-lg font-bold mt-4 mb-2 text-slate-900" {...props} />,
                                                    h2: ({ node, ...props }) => <h2 className="text-base font-bold mt-3 mb-2 text-slate-900" {...props} />,
                                                    h3: ({ node, ...props }) => <h3 className="text-sm font-bold mt-2 mb-1 text-slate-900" {...props} />,
                                                    code: ({ node, ...props }) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-xs font-mono" {...props} />,
                                                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-slate-300 pl-3 italic text-slate-500 my-2" {...props} />,
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            /* USER: EINFACHER TEXT (Markdown im User-Input kann komisch aussehen auf blauem Hintergrund) */
                                            <div className="whitespace-pre-wrap font-sans">
                                                {msg.content}
                                            </div>
                                        )
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 bg-white border-t border-slate-100">
                            <div className="relative flex items-center gap-2 max-w-4xl mx-auto">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="Stelle eine Frage zum PDF..."
                                    disabled={isGenerating}
                                    className="flex-1 bg-slate-100 border-0 rounded-full px-6 py-4 focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all disabled:opacity-50 text-sm"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={isGenerating || !input.trim()}
                                    className={`p-4 text-white rounded-full transition-colors shadow-md active:scale-95 disabled:opacity-50 ${selectedModel === MODELS.HIGH_RES ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}