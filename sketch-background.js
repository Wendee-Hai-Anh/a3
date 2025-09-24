// sketch-background.js — animated dot-grid background with "hello" mask
// APIs you can call from anywhere:
//   bgSetTheme('light'|'dark'|'brand')  // also auto-sets blend: dark=>dodge, others=>darken
//   bgSetTint(r,g,b)                    // lerped page bg from sketch.js
//   bgSetBlend('overlay'|'screen'|'multiply'|'dodge'|'darken'|...)
//   bgSetGlobeMask(radiusPx, softness[, cx, cy])  // avoid drawing under globe
//   bgNextAccent() / bgSetAccent(r,g,b)          // change accent palette
//   bgSetName('Your Name')                        // scrolling name ribbon

(() => {
  const mount = document.getElementById('bgLayer');
  if (!mount) return;

  // ------- theme / color state -------
  let theme  = 'light';
  let baseBg = [246, 248, 252];   // page bg from sketch.js
  let dotCol = [255, 140, 80];    // derived color for dots
  let bgBlend = 'lighten';         // p5 blend mode name
  const ACCENTS = [
    [255,145,149], [154,209,255], [168,136,255],
    [255,192,120], [145,255,210], [255,170,200], [140,180,255]
  ];
  let accentIdx = 0;
  let accentOverride = null;

  // avoid drawing under the WEBGL globe (soft edge)
  let globeMask = { cx: 0, cy: 0, r: 0, soft: 0.20 };
  let showRibbon = false;
  // ------- effect params -------
  let xScale = 0.005, yScale = 0.005;
  let gap = 10, offset = 0;
  const ALPHA_THRESHOLD = 100;
  const SIZE_MULTIPLIER = 2;
  const SPEED = 100;
  const INITIAL_INTERVAL = 200, FAST_INTERVAL = 125, TOGGLE_INTERVAL = 125;
  const MASK_SCALE = 0.66; // ~2/3

  let maskWord = 'HELLO';
let seq = [];
let toggleA = '', toggleB = '';
let idx = 0, inToggle = false, toggleState = false, lastChange = 0;

function rebuildSequence(w) {
  maskWord = (w || 'HELLO').trim();
  if (!maskWord) maskWord = 'HELLO';
  maskWord = maskWord.toUpperCase();

  // progressive build: "", first letter, ..., full name
  seq = [];
  for (let i = 0; i <= maskWord.length; i++) seq.push(maskWord.slice(0, i));

  // gentle toggle after full word:
  // if last letter is a vowel → repeat it (like helloo/hellooo),
  // otherwise toggle an ellipsis
  const last = maskWord[maskWord.length - 1] || '';
  if (/[AEIOUY]$/i.test(last)) {
    toggleA = maskWord + last;
    toggleB = maskWord + last + last;
  } else {
    toggleA = maskWord;
    toggleB = maskWord + '…';
  }

  idx = 0; inToggle = false; toggleState = false; lastChange = 0;
}
  let nameText = "";    // <-- prevents ReferenceError when no name yet
  let namePhase = 0;    // <-- used in the ribbon animation
rebuildSequence('HELLO'); // default until a real name arrives

  // compute a nice dot color from bg + accent (no p5 needed)
  function remapDotColor() {
    const [r,g,b] = baseBg;
    const L = 0.2126*r + 0.7152*g + 0.0722*b;
    const acc = accentOverride || ACCENTS[accentIdx % ACCENTS.length];
    const t = (L > 160) ? 0.22 : 0.65; // lighter bg → less mix
    dotCol = [
      Math.round(r + (acc[0]-r)*t),
      Math.round(g + (acc[1]-g)*t),
      Math.round(b + (acc[2]-b)*t),
    ];
  }
  remapDotColor();

  const app = new p5((p) => {
    p.pixelDensity(1);

    let maskG;
    let cols = 0, rows = 0;
    let tLast = 0;

    const smooth01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x*x*(3-2*x));
    const luma = ([r,g,b]) => 0.2126*r + 0.7152*g + 0.0722*b;

    function maskFadeAt(x, y){
      if (globeMask.r <= 0) return 1.0;
      const R = globeMask.r, R2 = R * (1 + globeMask.soft);
      const dx = x - globeMask.cx, dy = y - globeMask.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= R2*R2) return 1.0;
      if (d2 <= R*R)   return 0.0;
      return smooth01((Math.sqrt(d2) - R) / (R2 - R));
    }

    window.bgUseCssBlend = (mode='exclusion') => {
  const el = document.getElementById('bgLayer');
  if (!el) return;
  el.classList.remove('blend-exclusion');
  if (mode === 'exclusion') el.classList.add('blend-exclusion');
};

    function blendConst(name){
      switch((name||'').toLowerCase()){
        case 'screen':       return p.SCREEN;
        case 'multiply':     return p.MULTIPLY;
        case 'overlay':      return p.OVERLAY;
        case 'lighten':      return p.LIGHTEST;
        case 'darken':       return p.DARKEST;
        case 'add':          return p.ADD;
        case 'difference':   return p.DIFFERENCE;
        case 'exclusion':    return p.EXCLUSION;
        case 'soft-light':   return p.SOFT_LIGHT;
        case 'hard-light':   return p.HARD_LIGHT;
        case 'dodge':
        case 'color-dodge':  return p.DODGE;
        case 'burn':
        case 'color-burn':   return p.BURN;
        default:             return p.BLEND;
      }
    }

    function makeMask(){
      maskG = p.createGraphics(p.width, p.height);
      maskG.pixelDensity(1);
      maskG.clear();
      maskG.textAlign(maskG.CENTER, maskG.CENTER);

      const txt = inToggle ? (toggleState ? toggleB : toggleA) : seq[idx];
      if (!txt) return;

      let size = Math.min(p.width, p.height) * 0.22 * MASK_SCALE;
      maskG.textSize(size);
      const maxW = p.width*0.8*MASK_SCALE, maxH = p.height*0.8*MASK_SCALE;
      let tries = 8;
      while (tries-- > 0 && (maskG.textWidth(txt) > maxW || size > maxH)) {
        size *= 0.9; maskG.textSize(size);
      }
      maskG.fill(0,0,0,255);
      maskG.noStroke();
      maskG.text(txt, p.width/2, p.height/2);
    }

    function recomputeGrid(){
      cols = Math.ceil(p.width / gap);
      rows = Math.ceil(p.height / gap);
    }

    p.setup = () => {
      const c = p.createCanvas(window.innerWidth, window.innerHeight, p.P2D);
      c.parent(mount);
      p.frameRate(45);

      // choose default blend by theme
      bgSetBlend('lighten');
      bgUseCssBlend('exclusion');

      makeMask();
      recomputeGrid();
      lastChange = p.millis();
      tLast = p.millis();
      globeMask.cx = window.innerWidth/2;
      globeMask.cy = window.innerHeight/2;
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      makeMask();
      recomputeGrid();
    };

    p.draw = () => {
      // clear normally
      p.blendMode(p.BLEND);
      p.background(baseBg[0], baseBg[1], baseBg[2]);

      // step the hello / toggle sequence
      const now = p.millis();
      const FULL_INDEX = seq.length - 1;
const interval = inToggle ? TOGGLE_INTERVAL
                : (idx >= FULL_INDEX ? FAST_INTERVAL : INITIAL_INTERVAL);
      if (now - lastChange >= interval){
        if (!inToggle){
          idx++;
          if (idx >= seq.length){ inToggle = true; idx = seq.length-1; }
        } else {
          toggleState = !toggleState;
        }
        lastChange = now;
        makeMask();
      }

      // noise time
      const dt = Math.min(60, now - tLast);
      offset += (SPEED * dt) / 1000;
      tLast = now;

      // draw dots with chosen blend
      p.blendMode(blendConst(bgBlend));
      p.noStroke();

      const maskPix = maskG.get();
      maskPix.loadPixels();

      for (let iy = 0; iy < rows; iy++){
  const y = iy * gap + gap/2;
  for (let ix = 0; ix < cols; ix++){
    const x = ix * gap + gap/2;

    // 1) sample the name mask first
    const px = Math.max(0, Math.min(maskPix.width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(maskPix.height - 1, Math.floor(y)));
    const idx4 = 4 * (py * maskPix.width + px);
    const insideText = maskPix.pixels[idx4 + 3] > ALPHA_THRESHOLD;

    // 2) apply planet fade UNLESS it's a name pixel
    let fade = maskFadeAt(x, y);        // this zeros dots under the globe
    if (insideText) fade = Math.max(fade, 1.0); // punch through the globe mask
    if (fade <= 0.001) continue;

    // 3) size & draw
    const n = p.noise((x + offset) * xScale, (y + offset) * yScale);
    const baseSize = n * gap;
    const d = insideText ? baseSize * SIZE_MULTIPLIER : baseSize;
    if (d <= 0.4) continue;

    p.fill(dotCol[0], dotCol[1], dotCol[2], 255 * fade);
    p.circle(x, y, d);
  }
}

      // reset for crisp text
      p.blendMode(p.BLEND);

      // scrolling name ribbon (above mask)
      if (showRibbon && nameText){
        namePhase += Math.min(60, p.deltaTime) * 0.0006;
        const baseSize = Math.min(p.width, p.height) * 0.18;

        p.push();
        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(baseSize);

        const a = (luma(baseBg) > 160) ? 60 : 36; // stronger on light bg
        p.fill(dotCol[0], dotCol[1], dotCol[2], a);

        const tw = p.textWidth(nameText);
        const span = p.width + tw + 120;
        const x = (p.width - ((namePhase*120) % span)) - 60; // right→left wrap
        const y = p.height * (0.26 + 0.05 * Math.sin(namePhase*2.1));
        p.text(nameText, x, y);
        p.pop();
      }
    };
  }, mount);

  // ------- Public API (global) -------
  window.bgSetTheme = (name) => {
    theme = name || 'light';
    bgSetBlend('lighten');
    bgUseCssBlend('exclusion');
    remapDotColor();
  };
  window.bgSetTint  = (r,g,b) => { baseBg = [r,g,b]; remapDotColor(); };
  window.bgSetBlend = (name='normal') => { bgBlend = name; };

  window.bgSetGlobeMask = (radiusPx, softness = 0.20, cx = null, cy = null) => {
    globeMask.r    = Math.max(0, radiusPx|0);
    globeMask.soft = Math.max(0, Math.min(0.6, softness));
    if (cx != null) globeMask.cx = cx;
    if (cy != null) globeMask.cy = cy;
  };

  window.bgNextAccent = () => { accentOverride = null; accentIdx = (accentIdx+1)%ACCENTS.length; remapDotColor(); };
  window.bgSetAccent  = (r,g,b) => { accentOverride = [r,g,b]; remapDotColor(); };
  
  window.bgSetName = (str = '') => {
  nameText = '';                  // hide the flying overlay
  rebuildSequence(str);           // update the dot-grid word
  if (typeof makeMask === 'function') makeMask();
};
})();
