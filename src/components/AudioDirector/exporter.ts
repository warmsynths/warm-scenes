export interface AudioMarker {
  id: string;
  time: number;
  type: string;
}

/**
 * Generates an agnostic HTML string representing audio markers.
 * This string can be injected into the Hyperframes rendering environment.
 */
export function generateExportHTML(markers: AudioMarker[]): string {
  if (!markers || markers.length === 0) {
    return '';
  }

  // Sort markers by time chronologically
  const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);

  // Map to generic HTML div tags with data attributes
  const htmlLines = sortedMarkers.map((marker) => {
    return `  <div class="visual-event" data-type="${marker.type}" data-start="${marker.time.toFixed(3)}"></div>`;
  });

  return [
    `<!-- Audio Director Export -->`,
    `<div class="audio-director-events">`,
    ...htmlLines,
    `</div>`
  ].join('\n');
}
