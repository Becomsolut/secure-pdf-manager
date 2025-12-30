import * as pdfjsLib from 'pdfjs-dist';

// WICHTIG: Wir importieren den Worker direkt aus den Node_Modules mit dem Suffix "?url".
// Das sagt Vite: "Kümmere dich um den Pfad und kopiere es beim Build automatisch."
// @ts-ignore (TypeScript kennt ?url Importe manchmal nicht standardmäßig)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Setze den Worker Pfad auf die von Vite generierte URL
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdfToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument(arrayBuffer);
  const pdf = await loadingTask.promise;
  
  const images: string[] = [];
  const totalPages = pdf.numPages;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    
    // Skalierung für Thumbnails
    const viewport = page.getViewport({ scale: 0.5 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      // @ts-ignore
      await page.render(renderContext).promise;
      images.push(canvas.toDataURL('image/jpeg'));
    }
  }
  
  return images;
}