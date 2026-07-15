/**
 * Exports an array of configuration events as a downloadable JSON file.
 * 
 * @param events Array of configuration events (e.g., [{ time: 12.5, type: 'wave-gap', value: 'wide' }])
 * @param filename Name of the downloaded file (defaults to 'config.json')
 */
export function exportConfigAsJSON(events: any[] = [], filename: string = 'config.json') {
  const jsonString = JSON.stringify(events, null, 2);
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
