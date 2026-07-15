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

  // 1. Read JSON config
  const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let events = [];
  try {
    events = JSON.parse(configData);
  } catch (e) {
    console.error('Error parsing config.json:', e);
    process.exit(1);
  }

  // 2. Generate HTML divs for each event
  const eventsHtml = events.map((evt, i) => {
    return `      <div id="event-${i}" class="config-event clip" data-type="${evt.type}" data-value="${evt.value}" data-start="${evt.time}"></div>`;
  }).join('\n');

  // 3. Wrap in standard HTML5 with Audio and Canvas
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hyperframes Render Temp</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
</head>
<body>
  <div id="composition" data-composition-id="main" data-width="1920" data-height="1080" data-start="0">
    <!-- Three.js Canvas -->
    <canvas id="canvas"></canvas>

    <!-- Audio track -->
    <audio id="main-audio" src="${AUDIO_PATH}" data-start="0"></audio>

    <!-- Config Events -->
${eventsHtml}
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines['main'] = gsap.timeline();
  </script>

  <!-- App logic containing Three.js and HyperFrames initialization -->
  <script type="module" src="./src/components/main-app.ts"></script>
</body>
</html>`;

  // 4. Write temp file
  fs.writeFileSync(TEMP_HTML_PATH, htmlContent, 'utf-8');
  console.log(`Generated temporary HTML template: ${TEMP_HTML_PATH}`);

  // 5. Execute hyperframes render
  try {
    console.log(`Running: npx hyperframes render --composition hyperframes-temp.html --output ${OUTPUT_PATH}`);
    execSync(`npx hyperframes render --composition hyperframes-temp.html --output ${OUTPUT_PATH}`, { 
      stdio: 'inherit' 
    });
    console.log('Rendering complete!');
  } catch (err) {
    console.error('Error during HyperFrames rendering:', err.message);
  } finally {
    // 6. Cleanup temp file
    if (fs.existsSync(TEMP_HTML_PATH)) {
      fs.unlinkSync(TEMP_HTML_PATH);
      console.log(`Cleaned up temporary file: ${TEMP_HTML_PATH}`);
    }
  }
}

main();
