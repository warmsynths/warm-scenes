import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const CONFIG_PATH = path.resolve('config.json');
const AUDIO_PATH = 'audio.wav';
const TEMP_HTML_PATH = path.resolve('hyperframes-temp.html');
const OUTPUT_PATH = 'output.mp4';

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Error: Could not find ${CONFIG_PATH}. Please export it from the frontend first.`);
    process.exit(1);
  }

  // 1. Build the Vite app first so we have a bundle that a headless browser can load
  console.log('Building Vite app for render...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (err) {
    console.error('Build failed', err);
    process.exit(1);
  }

  // 2. Read the generated docs/index.html to find the compiled JS/CSS paths
  const docsIndexPath = path.resolve('docs', 'index.html');
  if (!fs.existsSync(docsIndexPath)) {
    console.error('Error: docs/index.html not found after build.');
    process.exit(1);
  }
  const indexHtmlStr = fs.readFileSync(docsIndexPath, 'utf-8');
  const scriptMatch = indexHtmlStr.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  const cssMatch = indexHtmlStr.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);

  const scriptSrc = scriptMatch ? scriptMatch[1].replace('/warm-scenes/', './docs/') : '';
  const cssHref = cssMatch ? cssMatch[1].replace('/warm-scenes/', './docs/') : '';

  // 3. Read JSON config
  const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let events = [];
  try {
    events = JSON.parse(configData);
  } catch (e) {
    console.error('Error parsing config.json:', e);
    process.exit(1);
  }

  // Find the exact audio duration to set data-duration correctly
  let duration = 60;
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${AUDIO_PATH}`, { encoding: 'utf-8' });
    const audioDuration = Math.ceil(parseFloat(output.trim()));
    if (!isNaN(audioDuration) && audioDuration > 0) {
      duration = audioDuration;
    }
  } catch(e) {
    console.warn('Could not determine audio duration with ffprobe, falling back to 60s.');
  }

  // 4. Generate HTML divs for each event
  const eventsHtml = events.map((evt, i) => {
    return `      <div id="event-${i}" class="config-event clip" data-type="${evt.type}" data-value="${evt.value}" data-start="${evt.time}"></div>`;
  }).join('\n');

  // 5. Wrap in standard HTML5 with Audio and wavefield-screen
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hyperframes Render Temp</title>
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
</head>
<body style="margin: 0; padding: 0;">
  <div id="composition" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="${duration}" style="width: 1920px; height: 1080px; position: relative; overflow: hidden; background: #000;">
    
    <!-- Audio track (Hyperframes will own this) -->
    <audio id="main-audio" src="${AUDIO_PATH}" data-start="0"></audio>

    <!-- Config Events -->
${eventsHtml}

    <!-- Target wavefield screen -->
    <wavefield-screen style="width: 100%; height: 100%; display: block;"></wavefield-screen>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines['main'] = gsap.timeline({ paused: true });
  </script>

  <!-- App logic containing Three.js and HyperFrames initialization -->
  ${scriptSrc ? `<script type="module" src="${scriptSrc}"></script>` : ''}
</body>
</html>`;

  // 6. Write temp file
  fs.writeFileSync(TEMP_HTML_PATH, htmlContent, 'utf-8');
  console.log(`Generated temporary HTML template: ${TEMP_HTML_PATH}`);

  // 7. Execute hyperframes render
  try {
    console.log(`Running: npx hyperframes render --composition hyperframes-temp.html --output ${OUTPUT_PATH}`);
    execSync(`npx hyperframes render --composition hyperframes-temp.html --output ${OUTPUT_PATH}`, { 
      stdio: 'inherit' 
    });
    console.log('Rendering complete!');
  } catch (err) {
    console.error('Error during HyperFrames rendering:', err.message);
  } finally {
    // 8. Cleanup temp file
    if (fs.existsSync(TEMP_HTML_PATH)) {
      fs.unlinkSync(TEMP_HTML_PATH);
      console.log(`Cleaned up temporary file: ${TEMP_HTML_PATH}`);
    }
  }
}

main();
