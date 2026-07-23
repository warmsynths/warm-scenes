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

  // Paths relative to project root for HyperFrames server
  const scriptSrc = scriptMatch ? scriptMatch[1].replace(/^\.\/assets\//, 'docs/assets/').replace(/^assets\//, 'docs/assets/') : '';
  const cssHref = cssMatch ? cssMatch[1].replace(/^\.\/assets\//, 'docs/assets/').replace(/^assets\//, 'docs/assets/') : '';

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

  try {
    if (engine === 'wave_field') {
      const script = config.script || [];
      eventsHtml = script.map((evt, i) => {
        const type = isLegacy ? evt.type : (evt.config ? evt.config.target : (evt.type || 'trigger'));
        const value = isLegacy ? evt.value : (evt.config ? (evt.config.value !== undefined ? evt.config.value : evt.config.amount) : (evt.value !== undefined ? evt.value : 0));
        return `      <div id="event-${i}" class="config-event clip" data-type="${type}" data-value="${value}" data-start="${evt.time}"></div>`;
      }).join('\n');

      const theme = config.theme || 'noir';
      const device = config.device || 'sp404';
      const speed = config.speed !== undefined ? config.speed : 8.0;
      const gap = config.gap !== undefined ? config.gap : 1;
      const height = config.height !== undefined ? config.height : 100;
      const displayMode = config.displayMode || (config.mode !== 'wave_field' ? config.mode : undefined) || 'full';
      const rippleDir = config.rippleDir || 'down';

      targetScreen = `<wavefield-screen 
        data-theme="${theme}"
        data-device="${device}"
        data-speed="${speed}"
        data-gap="${gap}"
        data-height="${height}"
        data-mode="${displayMode}"
        data-ripple-dir="${rippleDir}"
        style="width: 100%; height: 100%; display: block;">
      </wavefield-screen>`;
    } else if (engine === 'diorama') {
      const macros = config.macroShots || [];
      const micros = config.microCuts || [];
      
      const macroHtml = macros.map((evt, i) => {
        return `      <div id="macro-${i}" class="macro-shot clip" data-target="${evt.target || ''}" data-start="${evt.startTime}" data-duration="${evt.duration}" data-mood="${evt.mood || 'balanced'}"></div>`;
      }).join('\n');
      
      const microHtml = micros.map((evt, i) => {
        return `      <div id="micro-${i}" class="micro-cut clip" data-target="${evt.target || ''}" data-start="${evt.time}"></div>`;
      }).join('\n');
      
      eventsHtml = macroHtml + '\n' + microHtml;
      const environment = config.environment || {};
      targetScreen = `<lofi-dashboard
        data-primary-array="${(config.primaryArray || []).join(',')}"
        data-secondary-array="${(config.secondaryArray || []).join(',')}"
        data-active-gear="${(config.activeGear || []).join(',')}"
        data-weather="${environment.weather || 'sunny'}"
        data-time-of-day="${environment.timeOfDay || 'day'}"
        data-scene-mode="${environment.sceneMode || 'normal'}"
        data-celestial-position="${environment.celestialPosition !== undefined ? environment.celestialPosition : 50}"
        data-rain-intensity="${environment.rainIntensity !== undefined ? environment.rainIntensity : 50}"
        data-lightning-intensity="${environment.lightningIntensity !== undefined ? environment.lightningIntensity : 50}"
        style="width: 100%; height: 100%; display: block;">
      </lofi-dashboard>`;
    } else if (engine === 'credits') {
      eventsHtml = '';
      targetScreen = `<cinematic-credits 
        data-sun-size="${config.sunSize !== undefined ? config.sunSize : 0.4}" 
        data-sun-glow="${config.sunGlowAmount !== undefined ? config.sunGlowAmount : 1.0}" 
        data-grain-amount="${config.grainAmount !== undefined ? config.grainAmount : 3.5}" 
        data-selected-figure="${config.selectedFigure || 'couple'}" 
        data-sunset-speed="${config.sunsetSpeed !== undefined ? config.sunsetSpeed : 0.015}" 
        data-credits-speed="${config.creditsSpeed !== undefined ? config.creditsSpeed : 0.001}" 
        data-sync-to-audio="${config.syncToAudio ? 'true' : 'false'}" 
        data-sunset-progress="${config.sunsetManualProgress !== undefined ? config.sunsetManualProgress : 0.7}" 
        style="width: 100%; height: 100%; display: block;">
      </cinematic-credits>`;
    } else {
      console.error(`Error: Unsupported engine '${engine}' in config.json. Supported engines are 'wave_field', 'diorama', and 'credits'.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error generating event markup from config.json:', err);
    process.exit(1);
  }

  // 5. Wrap in standard HTML5 with Audio and target screen (offline, bundled JS handles GSAP)
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hyperframes Render Temp (${engine})</title>
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
</head>
<body style="margin: 0; padding: 0;">
  <div id="composition" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="${duration}" style="width: 1920px; height: 1080px; position: relative; overflow: hidden; background: #000;">
    
    <!-- Audio track (Hyperframes will own this) -->
    <audio id="main-audio" src="audio.wav" data-start="0"></audio>

    <!-- Config Events -->
${eventsHtml}

    <!-- Target screen -->
    ${targetScreen}
  </div>

  <script>
    window.__timelines = window.__timelines || {};
  </script>

  <!-- App logic containing Three.js and HyperFrames initialization -->
  ${scriptSrc ? `<script type="module" src="${scriptSrc}"></script>` : ''}
</body>
</html>`;

  // 6. Write temp file
  fs.writeFileSync(TEMP_HTML_PATH, htmlContent, 'utf-8');
  console.log(`Generated temporary HTML template: ${TEMP_HTML_PATH}`);

  // 7. Execute hyperframes render with controlled compression (default CRF 24 to keep file size reasonable)
  const args = process.argv.slice(2);
  let crfArg = '--crf 24'; // Default CRF 24 keeps 1080p videos under ~100MB instead of 1GB+
  
  // Allow CLI overrides e.g. node render.js --crf 20 or node render.js --video-bitrate 8M
  if (args.some(a => a.startsWith('--crf') || a.startsWith('--video-bitrate') || a.startsWith('-q') || a.startsWith('--quality'))) {
    crfArg = args.join(' ');
  }

  let renderFailed = false;
  try {
    const renderCmd = `npx hyperframes render --composition docs/hyperframes-temp.html --output ${OUTPUT_PATH} ${crfArg}`;
    console.log(`Running: ${renderCmd}`);
    execSync(renderCmd, { stdio: 'inherit' });
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(`Error: Render command completed but expected output file '${OUTPUT_PATH}' was not created.`);
      renderFailed = true;
    } else {
      const stats = fs.statSync(OUTPUT_PATH);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`Rendering complete! Final video size: ${sizeMB} MB (${OUTPUT_PATH})`);
    }
  } catch (err) {
    console.error('Error during HyperFrames rendering:', err.message);
    renderFailed = true;
  } finally {
    // 8. Cleanup temp file
    if (fs.existsSync(TEMP_HTML_PATH)) {
      fs.unlinkSync(TEMP_HTML_PATH);
      console.log(`Cleaned up temporary file: ${TEMP_HTML_PATH}`);
    }
  }

  if (renderFailed) {
    process.exit(1);
  }
}

main();
