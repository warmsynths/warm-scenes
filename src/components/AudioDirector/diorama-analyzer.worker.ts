import Meyda from 'meyda';

export interface DioramaAnalyzeRequest {
  type: 'ANALYZE_DIORAMA';
  payload: {
    channelData: Float32Array;
    sampleRate: number;
    primaryArray: string[];
    secondaryArray: string[];
    sensitivity?: number; // 1-100, default 50
  };
}

export interface DioramaAnalyzeResult {
  type: 'DIORAMA_RESULT';
  payload: {
    macroShots: Array<{
      id: string;
      startTime: number;
      duration: number;
      target: string;
      mood: 'chaotic' | 'submerged' | 'balanced' | 'ambient';
      intensity: number;
    }>;
    microCuts: Array<{
      id: string;
      time: number;
      target: string;
    }>;
  };
}

export interface DioramaAnalyzeError {
  type: 'DIORAMA_ERROR';
  payload: string;
}

export type DioramaWorkerMessage = DioramaAnalyzeRequest | DioramaAnalyzeResult | DioramaAnalyzeError;

self.onmessage = (e: MessageEvent<DioramaWorkerMessage>) => {
  if (e.data.type === 'ANALYZE_DIORAMA') {
    try {
      const {
        channelData,
        sampleRate,
        primaryArray,
        secondaryArray,
        sensitivity = 50
      } = e.data.payload;

      const bufferSize = 512;
      const hopSize = bufferSize; // non-overlapping frames
      const totalFrames = Math.floor((channelData.length - bufferSize) / hopSize);

      if (totalFrames < 2) {
        const result: DioramaAnalyzeResult = {
          type: 'DIORAMA_RESULT',
          payload: { macroShots: [], microCuts: [] }
        };
        self.postMessage(result);
        return;
      }

      // ── Pass 1: Extract per-frame RMS and ZCR ──────────────────

      const rmsValues: number[] = [];
      const zcrValues: number[] = [];
      const spectralCentroidValues: number[] = [];
      const frameTimes: number[] = [];

      // Configure Meyda sample rate
      Meyda.sampleRate = sampleRate;

      for (let i = 0; i < totalFrames; i++) {
        const offset = i * hopSize;
        const chunk = channelData.slice(offset, offset + bufferSize);
        
        const rms = Meyda.extract('rms', chunk) as unknown as number;
        const zcr = Meyda.extract('zcr', chunk) as unknown as number;
        const spectralCentroid = Meyda.extract('spectralCentroid', chunk) as unknown as number;

        rmsValues.push(rms ?? 0);
        zcrValues.push(zcr ?? 0);
        spectralCentroidValues.push(spectralCentroid ?? 0);
        frameTimes.push(offset / sampleRate);
      }

      // Calculate global average spectral centroid of the entire audio buffer
      const globalCentroidSum = spectralCentroidValues.reduce((sum, val) => sum + val, 0);
      const globalAverageCentroid = spectralCentroidValues.length > 0 ? globalCentroidSum / spectralCentroidValues.length : 1500;
      const maxRMS = rmsValues.length > 0 ? Math.max(...rmsValues) : 0;

      // ── Pass 2: Compute Energy Delta ───────────────────────────

      const energyDelta: number[] = [0];
      for (let i = 1; i < rmsValues.length; i++) {
        energyDelta.push(Math.abs(rmsValues[i] - rmsValues[i - 1]));
      }

      // ── Adaptive thresholds ────────────────────────────────────

      // Compute median and std of energy delta for adaptive thresholding
      const sortedDelta = [...energyDelta].sort((a, b) => a - b);
      const medianDelta = sortedDelta[Math.floor(sortedDelta.length / 2)];
      
      let sumSq = 0;
      for (const d of energyDelta) {
        sumSq += (d - medianDelta) * (d - medianDelta);
      }
      const stdDelta = Math.sqrt(sumSq / energyDelta.length);

      // Sensitivity 1 = very few events, 100 = many events
      const normalizedSensitivity = Math.max(0, Math.min(1, (sensitivity - 1) / 99));
      
      // Transient threshold: higher sensitivity = lower threshold
      const transientMultiplier = 2.5 - (normalizedSensitivity * 2.0); // range: 2.5 down to 0.5
      const transientThreshold = medianDelta + (stdDelta * transientMultiplier);

      // ZCR threshold for confirming percussive onsets
      const sortedZcr = [...zcrValues].sort((a, b) => a - b);
      const medianZcr = sortedZcr[Math.floor(sortedZcr.length / 2)];
      const zcrThreshold = medianZcr * (1.5 - normalizedSensitivity * 0.5);

      // Minimum hold-off between micro cuts (seconds)
      const microHoldOff = 0.3 - (normalizedSensitivity * 0.2); // 0.3s to 0.1s

      // ── Pass 3: Classify frames ────────────────────────────────

      const isTransient: boolean[] = energyDelta.map(
        (d, i) => d > transientThreshold && zcrValues[i] > zcrThreshold
      );

      // ── Pass 4: Generate Macro Shots from steady-state regions ─

      const macroShots: DioramaAnalyzeResult['payload']['macroShots'] = [];
      const microCuts: DioramaAnalyzeResult['payload']['microCuts'] = [];

      // Merge steady frames into contiguous blocks
      let blockStart: number | null = null;
      let macroCounter = 0;
      const minMacroDuration = 1.0; // minimum macro shot duration in seconds

      for (let i = 0; i < totalFrames; i++) {
        if (!isTransient[i]) {
          // Steady frame
          if (blockStart === null) {
            blockStart = i;
          }
        } else {
          // Transient frame — close any open steady block
          if (blockStart !== null) {
            const startTime = frameTimes[blockStart];
            const endTime = frameTimes[i];
            const duration = endTime - startTime;

            if (duration >= minMacroDuration) {
              macroCounter++;
              // Alternate between primaryArray and secondaryArray targets
              const arrayToUse = macroCounter % 2 === 1
                ? (primaryArray.length > 0 ? primaryArray : secondaryArray)
                : (secondaryArray.length > 0 ? secondaryArray : primaryArray);
              
              const targetId = arrayToUse.length > 0 
                ? arrayToUse[Math.floor(Math.random() * arrayToUse.length)] 
                : '';

              // Calculate average RMS and spectral centroid for mood matrix
              let rmsSum = 0;
              let centroidSum = 0;
              let count = 0;
              for (let f = blockStart; f < i; f++) {
                rmsSum += rmsValues[f];
                centroidSum += spectralCentroidValues[f];
                count++;
              }
              const avgRms = count > 0 ? rmsSum / count : 0;
              const avgCentroid = count > 0 ? centroidSum / count : 0;

              let mood: 'chaotic' | 'submerged' | 'balanced' | 'ambient' = 'balanced';
              if (avgRms < maxRMS * 0.15) {
                mood = 'ambient';
              } else if (avgCentroid > globalAverageCentroid * 1.3) {
                mood = 'chaotic';
              } else if (avgCentroid < globalAverageCentroid * 0.7) {
                mood = 'submerged';
              }

              const intensity = Math.min(1.0, Math.max(0.0, avgRms * 3.0));

              macroShots.push({
                id: `macro_${macroCounter}_${Math.random().toString(36).substr(2, 5)}`,
                startTime,
                duration,
                target: targetId,
                mood,
                intensity
              });
            }
            blockStart = null;
          }
        }
      }

      // Close final steady block
      if (blockStart !== null) {
        const startTime = frameTimes[blockStart];
        const endTime = frameTimes[totalFrames - 1];
        const duration = endTime - startTime;

        if (duration >= minMacroDuration) {
          macroCounter++;
          const arrayToUse = macroCounter % 2 === 1
            ? (primaryArray.length > 0 ? primaryArray : secondaryArray)
            : (secondaryArray.length > 0 ? secondaryArray : primaryArray);
          
          const targetId = arrayToUse.length > 0 
            ? arrayToUse[Math.floor(Math.random() * arrayToUse.length)] 
            : '';

          // Calculate average RMS and spectral centroid for mood matrix (final block)
          let rmsSum = 0;
          let centroidSum = 0;
          let count = 0;
          for (let f = blockStart; f < totalFrames; f++) {
            rmsSum += rmsValues[f];
            centroidSum += spectralCentroidValues[f];
            count++;
          }
          const avgRms = count > 0 ? rmsSum / count : 0;
          const avgCentroid = count > 0 ? centroidSum / count : 0;

          let mood: 'chaotic' | 'submerged' | 'balanced' | 'ambient' = 'balanced';
          if (avgRms < maxRMS * 0.15) {
            mood = 'ambient';
          } else if (avgCentroid > globalAverageCentroid * 1.3) {
            mood = 'chaotic';
          } else if (avgCentroid < globalAverageCentroid * 0.7) {
            mood = 'submerged';
          }

          const intensity = Math.min(1.0, Math.max(0.0, avgRms * 3.0));

          macroShots.push({
            id: `macro_${macroCounter}_${Math.random().toString(36).substr(2, 5)}`,
            startTime,
            duration,
            target: targetId,
            mood,
            intensity
          });
        }
      }

      // ── Pass 5: Generate Micro Cuts from transient frames ──────

      let microCounter = 0;
      let lastMicroTime = -1;

      for (let i = 0; i < totalFrames; i++) {
        if (isTransient[i]) {
          const time = frameTimes[i];

          if (time - lastMicroTime >= microHoldOff) {
            microCounter++;
            // Round-robin through primaryArray items
            const targetId = primaryArray.length > 0
              ? primaryArray[(microCounter - 1) % primaryArray.length]
              : (secondaryArray.length > 0 ? secondaryArray[0] : '');

            microCuts.push({
              id: `micro_${microCounter}_${Math.random().toString(36).substr(2, 5)}`,
              time,
              target: targetId
            });
            lastMicroTime = time;
          }
        }
      }

      const result: DioramaAnalyzeResult = {
        type: 'DIORAMA_RESULT',
        payload: { macroShots, microCuts }
      };
      self.postMessage(result);
    } catch (err: any) {
      const errorResponse: DioramaAnalyzeError = {
        type: 'DIORAMA_ERROR',
        payload: err.message
      };
      self.postMessage(errorResponse);
    }
  }
};
