import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const CONFIG_PATH = path.resolve('config.json');
const AUDIO_PATH = 'audio.wav';
const TEMP_HTML_PATH = path.resolve('docs', 'hyperframes-temp.html');
const OUTPUT_PATH = 'output.mp4';

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Error: Could not find ${CONFIG_PATH}. Please export it from the frontend first.`);
    process.exit(1);
  }

  // 1. Build the Vite app with a relative base so import.meta.env.BASE_URL resolves
  //    to './' at runtime, making texture paths relative to the HTML file location.
  //    The normal '/warm-scenes/' base in vite.config.ts is for GitHub Pages only.
  console.log('Building Vite app for render (base=./)...');
  try {
    execSync('npx vite build --base ./', { stdio: 'inherit' });
  } catch (err) {
    console.error('Build failed', err);
    process.exit(1);
  }

  // 2. Read the generated docs/index.html to find the compiled JS/CSS paths.
  //    The temp HTML is placed inside docs/ alongside the built output,
  //    so the relative paths (e.g. './assets/index-XXXX.js') work directly.
  const docsIndexPath = path.resolve('docs', 'index.html');
  if (!fs.existsSync(docsIndexPath)) {
    console.error('Error: docs/index.html not found after build.');
    process.exit(1);
  }
  const indexHtmlStr = fs.readFileSync(docsIndexPath, 'utf-8');
  const scriptMatch = indexHtmlStr.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  const cssMatch = indexHtmlStr.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);

  // Paths are relative to docs/ — use them directly (e.g. './assets/index-XXXX.js')
  const scriptSrc = scriptMatch ? scriptMatch[1] : '';
  const cssHref = cssMatch ? cssMatch[1] : '';

  // 3. Read JSON config
  const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let config = {};
  let isLegacy = false;
  
  try {
    const parsed = JSON.parse(configData);
    if (Array.isArray(parsed)) {
      isLegacy = true;
      config = { engine: 'wave_field', script: parsed };
    } else {
      config = parsed;
    }
  } catch (e) {
    console.error('Error parsing config.json:', e);
    process.exit(1);
  }

  const engine = config.engine || 'wave_field';

  // Find the exact audio duration to set data-duration correctly
  let duration = config.duration || 60;
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${AUDIO_PATH}`, { encoding: 'utf-8' });
    const audioDuration = Math.ceil(parseFloat(output.trim()));
    if (!isNaN(audioDuration) && audioDuration > 0) {
      duration = audioDuration;
    }
  } catch(e) {
    console.warn('Could not determine audio duration with ffprobe, falling back to config duration or 60s.');
  }

  // 4. Generate HTML divs for each event based on engine
  let eventsHtml = '';
  let targetScreen = '';

  if (engine === 'wave_field') {
    const script = config.script || [];
    eventsHtml = script.map((evt, i) => {
      // Handle legacy { time, type, value } vs new { time, config: { target, amount } }
      const type = isLegacy ? evt.type : evt.config.target;
      const value = isLegacy ? evt.value : evt.config.amount;
      return `      <div id="event-${i}" class="config-event clip" data-type="${type}" data-value="${value}" data-start="${evt.time}"></div>`;
    }).join('\n');
    targetScreen = `<wavefield-screen style="width: 100%; height: 100%; display: block;"></wavefield-screen>`;
  } else if (engine === 'diorama') {
    const macros = config.macroShots || [];
    const micros = config.microCuts || [];
    
    const macroHtml = macros.map((evt, i) => {
      return `      <div id="macro-${i}" class="macro-shot clip" data-target="${evt.target}" data-start="${evt.startTime}" data-duration="${evt.duration}" data-mood="${evt.mood || 'balanced'}"></div>`;
    }).join('\n');
    
    const microHtml = micros.map((evt, i) => {
      return `      <div id="micro-${i}" class="micro-cut clip" data-target="${evt.target}" data-start="${evt.time}"></div>`;
    }).join('\n');
    
    eventsHtml = macroHtml + '\n' + microHtml;
    // Add primary/secondary arrays as attributes or global window vars if needed, 
    // but the dashboard relies on localStorage. We'll pass them as data-attributes.
    targetScreen = `<diorama-screen 
      data-primary-array="${(config.primaryArray || []).join(',')}" 
      data-secondary-array="${(config.secondaryArray || []).join(',')}" 
      style="width: 100%; height: 100%; display: block;">
    </diorama-screen>`;
  }

  // 5. Wrap in standard HTML5 with Audio and target screen
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hyperframes Render Temp (${engine})</title>
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
</head>
<body style="margin: 0; padding: 0;">
  <div id="composition" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="${duration}" style="width: 1920px; height: 1080px; position: relative; overflow: hidden; background: #000;">
    
    <!-- Audio track (Hyperframes will own this) -->
    <audio id="main-audio" src="../audio.wav" data-start="0"></audio>

    <!-- Config Events -->
${eventsHtml}

    <!-- Target screen -->
    ${targetScreen}
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
    console.log(`Running: npx hyperframes render --composition docs/hyperframes-temp.html --output ${OUTPUT_PATH}`);
    execSync(`npx hyperframes render --composition docs/hyperframes-temp.html --output ${OUTPUT_PATH}`, { 
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
