import { AudioManager } from './audio-manager';
import type { DioramaAnalyzeResult, DioramaAnalyzeError } from '../components/AudioDirector/diorama-analyzer.worker';

export class AudioAutomationEngine {
  private audioManager: AudioManager;

  constructor(audioManager?: AudioManager) {
    this.audioManager = audioManager || new AudioManager();
  }

  public get manager(): AudioManager {
    return this.audioManager;
  }

  public createDioramaWorker(): Worker {
    return new Worker(
      new URL('../components/AudioDirector/diorama-analyzer.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  public createSpectrumWorker(): Worker {
    return new Worker(
      new URL('../components/AudioDirector/analyzer.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  public runDioramaAnalysis(
    worker: Worker,
    channelData: Float32Array,
    sampleRate: number,
    primaryArray: string[],
    secondaryArray: string[],
    sensitivity: number
  ): Promise<DioramaAnalyzeResult> {
    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent<DioramaAnalyzeResult | DioramaAnalyzeError>) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        if (e.data.type === 'DIORAMA_ERROR') {
          reject(new Error((e.data as DioramaAnalyzeError).payload));
        } else {
          resolve(e.data as DioramaAnalyzeResult);
        }
      };

      const handleError = (err: ErrorEvent) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(err);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      worker.postMessage({
        type: 'ANALYZE_DIORAMA',
        payload: {
          channelData,
          sampleRate,
          primaryArray,
          secondaryArray,
          sensitivity
        }
      });
    });
  }
}
