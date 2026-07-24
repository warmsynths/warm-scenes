import type { AudioDirector } from '../components/AudioDirector/AudioDirector';

/**
 * Exports any data payload as a downloadable JSON file.
 * 
 * @param data The data to serialize (array or object)
 * @param filename Name of the downloaded file (defaults to 'config.json')
 */
export function exportConfigAsJSON(data: any = [], filename: string = 'config.json') {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reads the active state from an <audio-director> element,
 * stamps it with an "engine" property matching the current mode,
 * merges optional extras (e.g. primaryArray, secondaryArray),
 * and triggers a config.json browser download.
 */
export function exportDirectorConfig(
  director: AudioDirector,
  extras?: Record<string, any>
): void {
  const state = director.getState();
  const payload: Record<string, any> = {
    engine: state.mode,
    ...state,
    ...(extras || {}),
  };
  // Ensure engine property is not overwritten by screen display modes (e.g. 'full' / 'joy')
  payload.engine = state.mode;
  if (extras && (extras.displayMode || extras.mode)) {
    payload.displayMode = extras.displayMode || extras.mode;
  }
  exportConfigAsJSON(payload, 'config.json');
}

/**
 * Utility to attach the JSON export function directly to a DOM button.
 * Useful if you're not using a component framework like Lit.
 * 
 * @param buttonId The ID of the button (e.g., 'export-config-btn')
 * @param getEvents A function that returns the array of configuration events to export.
 */
export function setupExportButton(buttonId: string, getEvents: () => any[] = () => []) {
  const btn = document.getElementById(buttonId);
  if (!btn) {
    console.warn(`Button with ID '${buttonId}' not found.`);
    return;
  }

  btn.addEventListener('click', () => {
    exportConfigAsJSON(getEvents());
  });
}
