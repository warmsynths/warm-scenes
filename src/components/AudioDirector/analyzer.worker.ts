import Meyda from 'meyda';

export type AnalyzeRequest = {
  type: 'ANALYZE';
  payload: {
    channelData: Float32Array;
    sampleRate: number;
    density?: number;
  };
};

export type AnalyzeResult = {
  type: 'RESULT';
  payload: Array<{ id: string; time: number; type: string }>;
};

export type AnalyzeError = {
  type: 'ERROR';
  payload: string;
};

export type WorkerMessage = AnalyzeRequest | AnalyzeResult | AnalyzeError;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'ANALYZE') {
    try {
      const { channelData, sampleRate, density = 20 } = e.data.payload;
      
      const bufferSize = 512; 
      const markers: Array<{ id: string; time: number; type: string }> = [];
      
      // Pass 1: Find maximum Spectral Flux (positive energy differences)
      let maxBassFlux = 0.001;
      let maxMidFlux = 0.001;
      let maxTrebleFlux = 0.001;
      
      let prevB = 0, prevM = 0, prevT = 0;
      
      for (let i = 0; i < channelData.length - bufferSize; i += bufferSize) {
        const chunk = channelData.slice(i, i + bufferSize);
        const powerSpectrum = Meyda.extract('powerSpectrum', chunk) as unknown as Float32Array;
        if (!powerSpectrum) continue;
        
        let b = 0, m = 0, t = 0;
        for (let j = 0; j < powerSpectrum.length; j++) {
          if (j < 12) b += powerSpectrum[j];
          else if (j < 46) m += powerSpectrum[j];
          else t += powerSpectrum[j];
        }
        
        const bassFlux = Math.max(0, b - prevB);
        const midFlux = Math.max(0, m - prevM);
        const trebleFlux = Math.max(0, t - prevT);
        
        if (bassFlux > maxBassFlux) maxBassFlux = bassFlux;
        if (midFlux > maxMidFlux) maxMidFlux = midFlux;
        if (trebleFlux > maxTrebleFlux) maxTrebleFlux = trebleFlux;
        
        prevB = b; prevM = m; prevT = t;
      }

      // Density 1: High threshold (0.95 of max flux), long hold-off (2.0s)
      // Density 100: Low threshold (0.1 of max flux), short hold-off (0.1s)
      const normalizedDensity = Math.max(0, Math.min(1, (density - 1) / 99));
      
      const multiplier = 0.95 - (normalizedDensity * 0.85); 
      const holdOffTime = 2.0 - (normalizedDensity * 1.9);
      
      const bassThreshold = maxBassFlux * multiplier;
      const midThreshold = maxMidFlux * multiplier;
      const trebleThreshold = maxTrebleFlux * multiplier;
      
      let lastBassTime = -1;
      let lastMidTime = -1;
      let lastTrebleTime = -1;

      let peakCounter = 0;
      
      prevB = 0; prevM = 0; prevT = 0;
      
      // Pass 2: Detect transients using Flux thresholds
      for (let i = 0; i < channelData.length - bufferSize; i += bufferSize) {
        const chunk = channelData.slice(i, i + bufferSize);
        const powerSpectrum = Meyda.extract('powerSpectrum', chunk) as unknown as Float32Array;
        if (!powerSpectrum) continue;
        
        let b = 0, m = 0, t = 0;
        for (let j = 0; j < powerSpectrum.length; j++) {
          if (j < 12) b += powerSpectrum[j];
          else if (j < 46) m += powerSpectrum[j];
          else t += powerSpectrum[j];
        }
        
        const bassFlux = Math.max(0, b - prevB);
        const midFlux = Math.max(0, m - prevM);
        const trebleFlux = Math.max(0, t - prevT);
        
        prevB = b; prevM = m; prevT = t;
        
        const time = i / sampleRate;
        
        // 1. Bass Onset
        if (bassFlux > bassThreshold) {
          if (time - lastBassTime > holdOffTime) {
            peakCounter++;
            markers.push({ id: `bass_${peakCounter}_${Math.random().toString(36).substr(2, 5)}`, time, type: 'bass_transient' });
            lastBassTime = time;
          }
        }
        
        // 2. Mid Onset
        if (midFlux > midThreshold) {
          if (time - lastMidTime > holdOffTime) {
            peakCounter++;
            markers.push({ id: `mid_${peakCounter}_${Math.random().toString(36).substr(2, 5)}`, time, type: 'mid_transient' });
            lastMidTime = time;
          }
        }
        
        // 3. Treble Onset
        if (trebleFlux > trebleThreshold) {
          if (time - lastTrebleTime > holdOffTime) {
            peakCounter++;
            markers.push({ id: `treble_${peakCounter}_${Math.random().toString(36).substr(2, 5)}`, time, type: 'treble_transient' });
            lastTrebleTime = time;
          }
        }
      }
      
      const result: AnalyzeResult = { type: 'RESULT', payload: markers };
      self.postMessage(result);
    } catch (err: any) {
      const errorResponse: AnalyzeError = { type: 'ERROR', payload: err.message };
      self.postMessage(errorResponse);
    }
  }
};
