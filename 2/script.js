const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

/* --- Config --- */
const fontSize = 4;
// A density string optimized for human faces (good balance of strokes)
const chars = " @%#*+=-:. ";
const motionThreshold = 8; // Sensitivity to movement (Lower = more sensitive)

/* State for motion detection */
let previousFrameData = [];

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: window.innerWidth,
        height: window.innerHeight,
        facingMode: "user"
      }
    });
    video.srcObject = stream;
    video.onloadeddata = () => {
      handleResize();
      draw();
    };
  } catch (err) {
    alert("Camera error: " + err.message);
  }
}

// Helper: HSL Color Generator for Dynamic Lighting
// Hue: 25(Orange), 120(Green), 220(Navy)
function getColor(y, height, x, width, brightness) {
  // Normalize brightness (0-255) to Lightness (20%-80%)
  // We clamp it so it doesn't get too black or too white
  const lit = Math.max(30, Math.min(80, (brightness / 255) * 100));

  // Top Band (Saffron)
  if(y < height / 3) {
    return `hsl(25, 100%, ${lit}%)`;
  }
  // Middle Band (White/Navy)
  else if(y < (height / 3) * 2) {
    // Chakra Logic
    const cx = width / 2;
    const cy = height / 2;
    const dist = Math.sqrt((x - cx)**2 + (y - cy)**2);

    if(dist < height / 6) {
      return `hsl(240, 100%, ${lit}%)`; // Navy
    }
    return `hsl(0, 0%, ${lit}%)`; // White (Sat 0)
  }
  // Bottom Band (Green)
  else {
    return `hsl(130, 90%, ${lit}%)`; // Adjusted Green to pop more on black
  }
}

function draw() {
  // Draw video to background buffer
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;

  // Clear Screen
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `bold ${fontSize}px monospace`; // Bold makes it pop
  ctx.textBaseline = 'top';

  // If we resized, re-init the memory
  if (previousFrameData.length !== data.length) {
    previousFrameData = new Uint8ClampedArray(data);
  }

  // Scan Grid
  for (let y = 0; y < canvas.height; y += fontSize) {
    for (let x = 0; x < canvas.width; x += fontSize) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const avg = (r + g + b) / 3;

      // --- Motion Detection Logic ---
      // Compare current green channel to previous frame's green channel
      // (Green is usually the cleanest channel for brightness)
      const prevG = previousFrameData[i+1];
      const diff = Math.abs(g - prevG);

      // If pixel changed significantly, it's "Motion"
      const isMoving = diff > motionThreshold;

      if (avg > 15) {
        // Select Character
        const charIndex = Math.floor((avg / 255) * (chars.length - 1));
        // Reverse chars so darker = denser
        const char = chars[chars.length - 1 - charIndex];

        // Set Color
        ctx.fillStyle = getColor(y, canvas.height, x, canvas.width, avg);

        // VISUAL TRICK:
        // If moving, draw normally.
        // If static (background), reduce opacity to 0.3
        ctx.globalAlpha = isMoving ? 1.0 : 0.3;

        // Canvas translate needed to un-mirror text characters
        // (Since we flipped the whole canvas with CSS, text is backwards unless we flip back)
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1); // Flip text back to readable
        ctx.fillText(char, -fontSize, 0);
        ctx.restore();
      }
    }
  }

  // Update previous frame memory
  // We copy the current data to previousFrameData for the next loop
  previousFrameData.set(data);

  // Reset global alpha for next frame clears
  ctx.globalAlpha = 1.0;
  requestAnimationFrame(draw);
}

startCamera();

/* --- Resize Logic --- */
function handleResize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Reset previous frame to prevent array length mismatch errors on resize
  previousFrameData = [];
}
window.addEventListener('resize', handleResize);
