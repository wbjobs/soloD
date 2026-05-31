/// <reference lib="webworker" />

import Tesseract from 'tesseract.js';

export type OCRWorkerMessage =
  | { type: 'PROCESS'; imageData: ImageData; id: string }
  | { type: 'CANCEL'; id: string };

export type OCRWorkerResult =
  | { type: 'PROGRESS'; id: string; progress: number; status: string }
  | { type: 'RESULT'; id: string; text: string; confidence: number; words: any[] }
  | { type: 'ERROR'; id: string; error: string };

let isProcessing = false;
let currentId: string | null = null;

const ctx: Worker = self as any;

ctx.addEventListener('message', async (event: MessageEvent<OCRWorkerMessage>) => {
  const { type } = event.data;

  if (type === 'PROCESS') {
    const { imageData, id } = event.data;
    isProcessing = true;
    currentId = id;

    try {
      const result = await Tesseract.recognize(imageData, 'eng+chi_sim', {
        logger: (m) => {
          if (isProcessing && currentId === id) {
            let progress = 0;
            let status = '';

            if (m.status === 'loading tesseract core') {
              progress = 0.1;
              status = '加载核心';
            } else if (m.status === 'initializing tesseract') {
              progress = 0.2;
              status = '初始化引擎';
            } else if (m.status === 'loading language traineddata') {
              progress = 0.3 + (m.progress * 0.2);
              status = '加载语言包';
            } else if (m.status === 'recognizing text') {
              progress = 0.5 + (m.progress * 0.5);
              status = '识别中';
            }

            ctx.postMessage({
              type: 'PROGRESS',
              id,
              progress,
              status,
            } as OCRWorkerResult);
          }
        },
      });

      const words = result.data.words.map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
      }));

      ctx.postMessage({
        type: 'RESULT',
        id,
        text: result.data.text,
        confidence: result.data.confidence,
        words,
      } as OCRWorkerResult);
    } catch (error) {
      ctx.postMessage({
        type: 'ERROR',
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as OCRWorkerResult);
    } finally {
      isProcessing = false;
      currentId = null;
    }
  } else if (type === 'CANCEL') {
    isProcessing = false;
    currentId = null;
  }
});

export default {};
