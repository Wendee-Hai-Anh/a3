
// Global variables
window.setLightMode = (flag) => { isLight = !!flag; updateTheme(); };
let isLight = true;
let mainCanvas;
let currentMode = 'house';
let selectedHouse = 0;
let housePanelSaved = false, zodiacPanelSaved = false;
let gridLineCol, gridRimCol, glowColor;
let currentHouseIndex = selectedHouse || 0;
let currentZodiacIndex = 0;
const PLANET_SKIN_SCALE = 1.04; // 1.00 = same size, >1 covers the globe

  const bgm = document.getElementById('bgm');

  // Try to start right away (muted autoplay is allowed)
  bgm.play().catch(() => { /* ignore */ });

  // On first real interaction, unmute and fade in — no visible UI needed
  function unlock() {
    bgm.play().catch(() => {});
    bgm.muted = false;
    let vol = 0; bgm.volume = vol;
    const fade = setInterval(() => {
      vol += 0.05;
      if (vol >= 0.8) { bgm.volume = 0.8; clearInterval(fade); }
      else bgm.volume = vol;
    }, 100);

    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  }

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
  
//SAVE Screenshot
function isMobileDevice() {
    return window.matchMedia('(max-width: 481px), (hover: none) and (pointer: coarse)').matches;
}
function savePlutoScreenshot() {
    // file name like: pluto-2025-09-24-21-07-33.png
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `pluto-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    saveCanvas(name, 'png');   // p5 will download a PNG of the WEBGL canvas
}

// Defer panel + globe recolor until after flash finishes
let panelOpenQueued = false;
let queuedMode = 'house', queuedIndex = 0;

// Globe/orbit
const BASE_YAW = Math.PI / 6;
const TILT_Z = Math.PI / 6;
let rotY = 0, dragging = false, px = 0;
let spinVel = 0.0018;             // auto-spin speed (radians/frame)
const SPIN_DAMP = 0.995;          // decay toward rest
let R, zoom, DOT_PX, anchors = [];
const MERIDIANS = 12;
const PHI = (Math.sqrt(5) - 1) * Math.PI;
let t0 = 0;
const DOT_SHELL = 0.50; // base shell radius above the sphere (0.12 → 0.30)
const DOT_SHELL_WOB = 0.06; // wobble amount (breathing)

// === Planet Formation (integrated) ===
// --- tiny tweaks for planet texture ---
let pfSeed = 0;
let pfColA = null, pfColB = null;  // p5 colors copied from your transition's dotCols
let planetActive = false;
let planetPG = null;           // offscreen texture buffer
let planetPos = [];
let planetCol = [];
let planetR = 260;             // sphere radius (updated in computeLayout)
let planetN = 6000;            // walker count (scaled to screen)
let planetPalette = ["#FF9B00", "#FFE100", "#FFC900", "#EBE389", "#b8003d"];
//----------------COLORS---------------------
const PLANET_PALETTES = [
    ["#3B0270", "#6F00FF", "#E9B3FB", "#FFF1F1"],
    ["#FF9B00", "#FFE100", "#FFC900", "#EBE389", "#F85525"],
    ["#211C84", "#4D55CC", "#7A73D1", "#B5A8D5"],
    ["#B95E82", "#F39F9F", "#FFC29B", "#FFECC0", "#ee8572ff"],
    ["#FFF5F2", "#F5BABB", "#5ea097ff", "#064232", "#9fe6caff"],
    ["#3674B5", "#578FCA", "#F5F0CD", "#fcdd76ff", "#FADA7A"],
    ["#FF9149", "#FFECDB", "#AFDDFF", "#60B5FF", "#6bc0f1ff"],
    ["#B82132", "#D2665A", "#F2B28C", "#F6DED8"],
    ["#8F87F1", "#C68EFD", "#E9A5F1", "#FED2E2"],
    ["#ffe8e8ff", "#d3f1fcff", "#b3ccfaff", "#bbaefaff"],
    ["#3A59D1", "#3D90D7", "#7AC6D2", "#B5FCCD", "#d6faf2ff"],
    ["#78B3CE", "#C9E6F0", "#fadfbcff", "#F96E2A"]
];
function paletteToP5Colors(pal){
  return (pal || []).map(c => (c instanceof p5.Color ? c : color(c)));
}

// t in [0..1] → smoothly blend across all colors in the palette
function colorFromPalette(cols, t){
  if (!cols || cols.length === 0) return color(255);
  if (cols.length === 1) return cols[0];
  t = constrain(t, 0, 1);
  const segF = t * (cols.length - 1);
  const i = floor(segF);
  const f = segF - i;
  const c1 = cols[i];
  const c2 = cols[min(i + 1, cols.length - 1)];
  return lerpColor(c1, c2, f);
}
function paletteFromIndices(hIndex, zIndex) {
    const idx = Math.abs(((hIndex | 0) * 13 + (zIndex | 0) * 7)) % PLANET_PALETTES.length;
    return PLANET_PALETTES[idx];
}

function initPlanetIfNeeded() {
  if (planetPG) return;

  // planetR is set from computeLayout, don’t overwrite it here.
  const baseArea = 1440 * 900;
  const area = (windowWidth * windowHeight) || baseArea;
  planetN = Math.round(6000 * area / baseArea);

  const TEX_MULT = 4.5; // raise to 5–6 if you want sharper
  planetPG = createGraphics(
    Math.floor(planetR * TEX_MULT),
    Math.floor(planetR * TEX_MULT)
  );

  planetPos.length = 0;
  planetCol.length = 0;
  for (let i = 0; i < planetN; i++) {
    planetPos[i] = createVector(random(planetPG.width), random(planetPG.height));
    planetCol[i] = planetPalette[i % planetPalette.length];
  }
}

function startPlanetFormation(hIndex, zIndex) {
    planetPalette = paletteFromIndices(hIndex, zIndex);
    planetActive = true;
    planetPG = null;           // rebuild with new palette on next frame
    initPlanetIfNeeded();
}

function stopPlanetFormation() { planetActive = false; }

function drawPlanetLayer() {
    const cols = paletteToP5Colors(planetPalette);
    if (!planetActive) return;
    const t = frameCount;
    initPlanetIfNeeded();

for (let i = 0; i < planetPos.length; i++) {
  // normalised coords
  const nx = planetPos[i].x / planetPG.width;
  const ny = planetPos[i].y / planetPG.height;

  // subtle curl-like flow using two nearby noises (keeps your motion)
  const a = noise(nx * 18 + 7.123,  ny * 18 - 3.987);
  const b = noise(nx * 18 - 11.554, ny * 18 + 2.341);
  const ang = (a - b) * TWO_PI;

  const step = 1.4 + noise(i * 0.013 + t * 0.002) * 1.2;
  const vx = cos(ang) * step;
  const vy = sin(ang) * step;

  // advance & wrap
  planetPos[i].x = (planetPos[i].x + vx + planetPG.width)  % planetPG.width;
  planetPos[i].y = (planetPos[i].y + vy + planetPG.height) % planetPG.height;

  // ---------- FULL-PALETTE COLOR ----------
  // Combine a slow noise field with a gentle vertical band so all colors show
  let hueT = 0.58 * noise(nx * 2.2 + t * 0.0014, ny * 2.2)   // organic clusters
            + 0.42 * ny;                                     // soft latitude bands
  hueT = hueT % 1;

  const col = colorFromPalette(cols, hueT);

  // dash (glow line) instead of dot – same look you had
  planetPG.blendMode(ADD);
  planetPG.stroke(red(col), green(col), blue(col), 170);
  planetPG.strokeWeight(0.9 + 0.8 * noise(t * 0.01 + i));
  planetPG.line(
    planetPos[i].x,                  planetPos[i].y,
    planetPos[i].x - vx * 3.2,       planetPos[i].y - vy * 3.2
  );
  planetPG.blendMode(BLEND);
}

    noStroke();
    texture(planetPG);
    sphere(planetR, 64, 48);
}
// === /Planet Formation ===


function menuIsOpen() {
    const el = document.getElementById('menuOverlay');
    return el && el.classList.contains('open');
}

// Labels
let labelMode = 'house';
let showHouseNames = true;
const ZOD = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const HOUSE_LABELS = [
    "1st • Self", "2nd • Resources", "3rd • Communication", "4th • Home",
    "5th • Creativity", "6th • Routines", "7th • Partnership", "8th • Shared",
    "9th • Beliefs", "10th • Career", "11th • Community", "12th • Subconscious"
];

var ZODIAC_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

var PLUTO_IN_SIGNS = [
    {
        title: "Pluto in Aries",
        meaning: "Revolutionary pioneer energy. You're driven to initiate major changes and break new ground. Leadership comes naturally, but with great intensity.",
        traits: ["Pioneering spirit", "Competitive drive", "Revolutionary ideas", "Independent nature"],
        challenges: "Learning patience and considering others' needs in your quest for change."
    },
    {
        title: "Pluto in Taurus",
        meaning: "Deep transformation of values and material security. You seek to rebuild foundations and create lasting, meaningful change in the physical world.",
        traits: ["Persistent transformation", "Material wisdom", "Environmental consciousness", "Steady power"],
        challenges: "Overcoming stubbornness and embracing necessary changes to outdated systems."
    },
    {
        title: "Pluto in Gemini",
        meaning: "Transformation through communication and information. Your generation revolutionizes how knowledge is shared and processed.",
        traits: ["Information revolution", "Mental transformation", "Communication power", "Intellectual intensity"],
        challenges: "Avoiding information overload and using knowledge responsibly."
    },
    {
        title: "Pluto in Cancer",
        meaning: "Deep transformation of home, family, and emotional foundations. You're part of major changes in domestic life and nurturing.",
        traits: ["Emotional depth", "Family transformation", "Protective instincts", "Intuitive power"],
        challenges: "Balancing emotional intensity with rational thinking and avoiding possessiveness."
    },
    {
        title: "Pluto in Leo",
        meaning: "Transformation of creative expression and personal power. Your generation revolutionizes entertainment, creativity, and self-expression.",
        traits: ["Creative transformation", "Dramatic power", "Leadership magnetism", "Artistic intensity"],
        challenges: "Managing ego and using creative power for collective benefit."
    },
    {
        title: "Pluto in Virgo",
        meaning: "Transformation of work, health, and daily routines. You're part of major changes in how we approach service, health, and practical matters.",
        traits: ["Work revolution", "Health consciousness", "Practical transformation", "Service dedication"],
        challenges: "Avoiding perfectionism and criticism while maintaining high standards."
    },
    {
        title: "Pluto in Libra",
        meaning: "Transformation of relationships, justice, and balance. Your generation revolutionizes partnerships and social harmony.",
        traits: ["Relationship transformation", "Justice seeking", "Diplomatic power", "Aesthetic revolution"],
        challenges: "Making decisions independently and avoiding codependency in relationships."
    },
    {
        title: "Pluto in Scorpio",
        meaning: "Most powerful Pluto placement in its own sign. Intense transformation, psychological depth, and regenerative power define your generation.",
        traits: ["Intense transformation", "Psychic abilities", "Sexual revolution", "Death and rebirth mastery"],
        challenges: "Managing overwhelming intensity and using power constructively."
    },
    {
        title: "Pluto in Sagittarius",
        meaning: "Transformation of beliefs, education, and global perspectives. Your generation revolutionizes philosophy, religion, and higher learning.",
        traits: ["Belief transformation", "Global consciousness", "Educational revolution", "Spiritual seeking"],
        challenges: "Avoiding dogmatism and remaining open to diverse perspectives."
    },
    {
        title: "Pluto in Capricorn",
        meaning: "Transformation of structures, authority, and institutions. Your generation is rebuilding government, business, and social hierarchies.",
        traits: ["Structural transformation", "Authority revolution", "Institutional reform", "Practical power"],
        challenges: "Balancing ambition with ethics and avoiding authoritarian tendencies."
    },
    {
        title: "Pluto in Aquarius",
        meaning: "Transformation of technology, humanitarian ideals, and collective consciousness. Revolutionary changes in how humanity connects and progresses.",
        traits: ["Technological revolution", "Humanitarian transformation", "Collective awakening", "Innovation power"],
        challenges: "Maintaining human connection in an increasingly digital world."
    },
    {
        title: "Pluto in Pisces",
        meaning: "Transformation of spirituality, compassion, and collective consciousness. Deep changes in how we understand unity and transcendence.",
        traits: ["Spiritual transformation", "Compassionate revolution", "Psychic awakening", "Universal love"],
        challenges: "Staying grounded while exploring spiritual depths and avoiding escapism."
    }
];

var PLUTO_MEANINGS = [
    {
        title: "Pluto in 1st House",
        meaning: "Transformation of identity and self-image. You possess intense personal magnetism and a powerful presence. Life involves continual rebirth and reinvention of yourself.",
        traits: ["Magnetic personality", "Intense self-awareness", "Natural leadership", "Transformative presence"],
        challenges: "Learning to balance power and vulnerability in personal expression."
    },
    {
        title: "Pluto in 2nd House",
        meaning: "Deep transformation around values, possessions, and self-worth. You may experience dramatic changes in financial circumstances and material security.",
        traits: ["Resourceful with money", "Transformative relationship with possessions", "Deep values", "Regenerative abilities"],
        challenges: "Overcoming possessiveness and finding true self-worth beyond material things."
    },
    {
        title: "Pluto in 3rd House",
        meaning: "Intense communication style and transformative learning experiences. Your words carry power and can profoundly influence others.",
        traits: ["Penetrating insight", "Powerful communication", "Transformative ideas", "Deep curiosity"],
        challenges: "Learning to communicate without overwhelming or manipulating others."
    },
    {
        title: "Pluto in 4th House",
        meaning: "Deep transformation within family dynamics and emotional foundations. Your home life may involve intense experiences and psychological depths.",
        traits: ["Strong family bonds", "Emotional intensity", "Protective instincts", "Deep roots"],
        challenges: "Healing family patterns and creating emotional security from within."
    },
    {
        title: "Pluto in 5th House",
        meaning: "Transformative creative expression and intense romantic experiences. Your creative work has the power to deeply move and transform others.",
        traits: ["Passionate creativity", "Intense romance", "Transformative art", "Magnetic charm"],
        challenges: "Balancing creative intensity with playfulness and avoiding creative obsessions."
    },
    {
        title: "Pluto in 6th House",
        meaning: "Transformation through daily routines, work, and health practices. You have the power to completely regenerate your physical and mental well-being.",
        traits: ["Healing abilities", "Work transformation", "Health consciousness", "Service to others"],
        challenges: "Avoiding perfectionism and learning healthy boundaries in service to others."
    },
    {
        title: "Pluto in 7th House",
        meaning: "Intense and transformative relationships and partnerships. You attract powerful people and experience deep psychological growth through relationships.",
        traits: ["Transformative partnerships", "Relationship intensity", "Powerful allies", "Diplomatic insight"],
        challenges: "Learning healthy relationship dynamics and avoiding power struggles with partners."
    },
    {
        title: "Pluto in 8th House",
        meaning: "Natural placement for Pluto. Deep involvement with shared resources, psychology, and transformation. You have natural healing and regenerative abilities.",
        traits: ["Psychic abilities", "Financial insight", "Healing powers", "Death and rebirth themes"],
        challenges: "Managing intensity and learning to trust the transformation process."
    },
    {
        title: "Pluto in 9th House",
        meaning: "Transformative beliefs and philosophies. Your worldview undergoes dramatic changes, and you may become a powerful teacher or spiritual leader.",
        traits: ["Philosophical depth", "Spiritual transformation", "Teaching abilities", "Foreign connections"],
        challenges: "Avoiding dogmatism and remaining open to evolving beliefs."
    },
    {
        title: "Pluto in 10th House",
        meaning: "Powerful career ambitions and transformative public image. You're destined for positions of influence and may completely transform your professional field.",
        traits: ["Leadership abilities", "Professional transformation", "Public influence", "Career magnetism"],
        challenges: "Using power responsibly and avoiding ruthless ambition."
    },
    {
        title: "Pluto in 11th House",
        meaning: "Transformative friendships and group involvement. You attract powerful allies and may lead social movements or revolutionary causes.",
        traits: ["Group leadership", "Social transformation", "Powerful friendships", "Future vision"],
        challenges: "Balancing individual power with group harmony and avoiding manipulation of friends."
    },
    {
        title: "Pluto in 12th House",
        meaning: "Deep subconscious transformation and spiritual regeneration. Your power comes from within and through connection to the collective unconscious.",
        traits: ["Psychic sensitivity", "Spiritual healing", "Hidden strength", "Karmic understanding"],
        challenges: "Bringing unconscious power into conscious awareness and avoiding victim mentalities."
    }
];

// background lerp to dot color
let bgFrom, bgTo, bgT = 1;      // 0→1 progress
let bgLerpSpeed = 0.02;

// === Glowy Orbs: fill screen → flash → bg changes ===
let WALKER_COUNT = 300;
let SPAWN_PER_FRAME = 20;
const FILL_FRAMES = 8;
const HOLD_FRAMES = 7;
const FLASH_FRAMES = 11;
const FADE_FRAMES = 15;
let walkers = [];
let transitionActive = false;
let transitionPhase = 0;  // 0=fill,1=hold,2=flash,3=fade
let transitionTimer = 0;
let spawned = 0;
let padding = 20;

let dotCols = [];          // the 2 particle colors selected this turn
let bgPick = null;        // the one we morph the background to
let globeDotColor;         // color for non-selected globe dots

let orbSprite;             // radial sprite for glowy dots

const transitionPalettes = [
    ["#fffdfdff", "#f8cdbcff"],
    ["#a867ceff", "#f85e59ff"],
    ["#7cfd85ff", "#e3fa90ff"],
    ["#f8de81ff", "#fdf474ff"],
    ["#ffc078ff", "#f38c90ff"],
    ["#2691e9ff", "#3553daff"],
    ["#a888ffff", "#fd7fafff"],
    ["#1A202C", "#bf3fdfff"]
];
const _ww = (typeof windowWidth !== 'undefined' && windowWidth) ? windowWidth : (window.innerWidth || 1280);
const _wh = (typeof windowHeight !== 'undefined' && windowHeight) ? windowHeight : (window.innerHeight || 720);
const pxArea = _ww * _wh * (window.devicePixelRatio || 1);
// 3e6 ≈ 1920×1080 on DPR=1. Bigger screens → 1.0, mobiles → ~0.5
const load = Math.min(1, pxArea / 3_000_000);

WALKER_COUNT = Math.round(420 * load);     // ~520 on desktop, ~260 on phones
SPAWN_PER_FRAME = Math.max(5, Math.round(WALKER_COUNT / 50));
// ---- Utils ----
const secs = () => (performance.now() - t0) * 0.001;
function sph(r, lat, lon) { return { x: r * cos(lat) * cos(lon), y: r * sin(lat), z: r * cos(lat) * sin(lon) }; }
function hasGlyph(ch) {
    push(); textSize(DOT_PX * 0.6);
    const w = textWidth(ch), wBox = textWidth("□");
    pop(); return abs(w - wBox) > 1;
}

// ---- Orb sprite ----
function makeOrbSprite() {
  const s = 256, r = s / 2;
  orbSprite = createGraphics(s, s);
  const ctx = orbSprite.drawingContext;

  // start clean
  ctx.clearRect(0, 0, s, s);

  // CORE glow (white → transparent)
  const g1 = ctx.createRadialGradient(r, r, 0, r, r, r);
  g1.addColorStop(0.00, "rgba(255,255,255,0.85)");
  g1.addColorStop(0.30, "rgba(255,255,255,0.38)");
  g1.addColorStop(0.55, "rgba(255,255,255,0.10)");
  g1.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI*2); ctx.fill();

  // BRIGHT RING (thin)
  const g2 = ctx.createRadialGradient(r, r, r*0.44, r, r, r*0.64);
  g2.addColorStop(0.00, "rgba(255,255,255,0.00)");
  g2.addColorStop(0.49, "rgba(255,255,255,0.00)");
  g2.addColorStop(0.50, "rgba(255,255,255,0.36)"); // ring
  g2.addColorStop(0.51, "rgba(255,255,255,0.00)");
  g2.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, s, s);

  // SOFT OUTER RING
  const g3 = ctx.createRadialGradient(r, r, r*0.58, r, r, r*0.90);
  g3.addColorStop(0.00, "rgba(255,255,255,0.00)");
  g3.addColorStop(0.40, "rgba(255,255,255,0.16)");
  g3.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, s, s);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

// Use current background tint to derive two glow colors
function updateGlowPaletteFromBg(){
  const bgNow = lerpColor(bgFrom, bgTo, bgT);
  // one lighter, one slightly deeper than the bg so it harmonizes
  const c1 = lerpColor(bgNow, color(255), 0.55);
  const c2 = lerpColor(bgNow, color(0),   0.10);
  dotCols = [c1, c2];
  bgPick  = c1;   // if you flash the bg toward one of the glow colors
}
// ---------- Particles ----------
class TransitionWalker {
    constructor(x, y, col) {
        this.x = x; this.y = y; this.color = col;
        this.baseSize = 1 + random(1.4);
        this.life = 1;
        const ang = random(TWO_PI), speed = 1.2 + random(1.0);
        this.vx = cos(ang) * speed; this.vy = sin(ang) * speed;
        this.jitter = 0.35; this.drag = 0.992; this.maxV = 3.2;
    }
    step(minX, minY, maxX, maxY) {
        this.vx += (random() - 0.5) * this.jitter;
        this.vy += (random() - 0.5) * this.jitter;
        const v = Math.hypot(this.vx, this.vy) || 1;
        if (v > this.maxV) { const s = this.maxV / v; this.vx *= s; this.vy *= s; }
        this.x += this.vx; this.y += this.vy;
        if (this.x < minX || this.x > maxX) { this.vx *= -0.9; this.x = constrain(this.x, minX, maxX); }
        if (this.y < minY || this.y > maxY) { this.vy *= -0.9; this.y = constrain(this.y, minY, maxY); }
        this.vx *= this.drag; this.vy *= this.drag;
        if (transitionPhase === 3) { this.life = max(0, 1 - transitionTimer / FADE_FRAMES); }
    }
    draw() {
        if (this.life <= 0) return;

  // screen-space coords (because drawWalkerField() switched to ortho + resetMatrix)
  const sx = this.x - width / 2;
  const sy = this.y - height / 2;

  // BIGGER halos (desktop vs mobile)
  const base = (windowWidth > 700) ? 48 : 40;      // scale multiplier
  const scale = this.baseSize * base;

  // soft color & life
  const r = red(this.color), g = green(this.color), b = blue(this.color);
  const a = 165 * this.life;

  // glow sprite (use SCREEN for softer look; ADD also OK)
  blendMode(SCREEN);
  tint(r, g, b, a);
  image(orbSprite, sx - scale/2, sy - scale/2, scale, scale);
  noTint();

  // subtle colored rim to match your screenshot
  const rim = scale * 0.42;
  noFill();
  stroke(r, g, b, 110 * this.life);
  strokeWeight(1.6);
  ellipse(sx, sy, rim, rim);

  // faint inner ring for depth
  stroke(r, g, b, 60 * this.life);
  strokeWeight(1.1);
  ellipse(sx, sy, rim * 0.66, rim * 0.66);

  // restore normal blending for next draws
  blendMode(BLEND);
    }
}

function startWalkerTransition() {
    if (transitionActive) return;       // ignore re-entrancy
    transitionActive = true;
    transitionPhase = 0; transitionTimer = 0;
    walkers.length = 0; spawned = 0;

    const palette = transitionPalettes[selectedHouse % transitionPalettes.length];
    dotCols = [color(palette[0]), color(palette[1])];
    bgPick = dotCols[1];               // or random(dotCols)
    if (window.bgNextAccent) window.bgNextAccent();
    // BG morph happens during FLASH phase (not yet).
}

function updateWalkerTransition() {
    if (!transitionActive) return;
    transitionTimer++;

    if (transitionPhase === 0) {
        for (let i = 0; i < SPAWN_PER_FRAME && spawned < WALKER_COUNT; i++) {
            const col = random() < 0.5 ? dotCols[0] : dotCols[1];
            walkers.push(new TransitionWalker(random(padding, width - padding), random(padding, height - padding), col));
            spawned++;
        }
        if (transitionTimer > FILL_FRAMES && spawned >= WALKER_COUNT) { transitionPhase = 1; transitionTimer = 0; }

    } else if (transitionPhase === 1) {
        if (transitionTimer > HOLD_FRAMES) {
            transitionPhase = 2; transitionTimer = 0;
            // Kick BG morph now → chosen particle color
            bgFrom = lerpColor(bgFrom, bgTo, bgT);
            bgTo = bgPick;
            bgT = 0;
            bgLerpSpeed = 0.08;
        }

    } else if (transitionPhase === 2) {
        if (transitionTimer > FLASH_FRAMES) {
            transitionPhase = 3;
            transitionTimer = 0;
            bgLerpSpeed = 0.03;

            applyPlanetTheme(bgPick, dotCols);

            // 🔴 OPEN THE QUEUED PANEL, THEN ADVANCE THE QUEUE
            if (panelOpenQueued) {
                const idx = queuedIndex;
                const mode = queuedMode;
                panelOpenQueued = false;

                // (Optional) keep UI mode in sync
                if (typeof ensureMode === 'function') ensureMode(mode);

                if (mode === 'both') {
                    // Open both panels in one flash without auto-closing the other
                    try {
                        window.suppressPanelAutoclose = true;
                        showHouseInfo(idx);
                        var zi = (typeof window.queuedZodiacIndex === 'number') ? window.queuedZodiacIndex : idx;
                        showZodiacInfo(zi);
                    } catch (err) { console.error('Both-panels open error:', err); }
                    finally { window.suppressPanelAutoclose = false; }
                    // Clear any queue; afterFlash will no-op if empty
                    if (window.afterFlash) window.afterFlash();
                } else {
                    (mode === 'house' ? showHouseInfo : showZodiacInfo)(idx);
                    // 👉 tell script.js to open the next queued panel
                    if (window.afterFlash) window.afterFlash();
                }
            }
        }

    } else if (transitionPhase === 3) {
        if (transitionTimer > FADE_FRAMES) { transitionActive = false; walkers.length = 0; }
    }

    for (const w of walkers) w.step(padding, padding, width - padding, height - padding);
}


// walkers layer (behind globe)
function drawWalkerField() {
    if (!transitionActive || walkers.length === 0) return;
    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);
    push();
    resetMatrix();
    ortho(-width / 2, width / 2, -height / 2, height / 2, 0.01, 1000);
    blendMode(ADD);
    noStroke();
    for (const w of walkers) w.draw();
    blendMode(BLEND);
    pop();
    gl.enable(gl.DEPTH_TEST);
}

// flash overlay (on top of everything)
function drawFlashOverlay() {
    if (transitionPhase !== 2) return;
    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);
    push();
    resetMatrix();
    ortho(-width / 2, width / 2, -height / 2, height / 2, 0.01, 1000);
    const f = transitionTimer / FLASH_FRAMES;
    const a = 255 * sin(f * PI);              // one pulse
    noStroke();
    fill(red(bgPick), green(bgPick), blue(bgPick), a);
    rect(-width / 2, -height / 2, width, height);
    pop();
    gl.enable(gl.DEPTH_TEST);
}

// ---------- p5 lifecycle ----------
function setup() {
    setAttributes('alpha', true);        // must be BEFORE createCanvas for WEBGL
    setAttributes('antialias', true);

    mainCanvas = createCanvas(windowWidth, windowHeight, WEBGL);
    mainCanvas.elt.classList.add('main-canvas');   // <-- add a class we can style

    frameRate(60);
    setAttributes('antialias', true);
    pixelDensity(1);
    textFont('system-ui'); textAlign(CENTER, CENTER); textStyle(BOLD);

    makeOrbSprite();
    computeLayout();
    makeAnchors();
    t0 = performance.now();
    bgFrom = isLight ? color(255,145,149) : color(246,248,252);
    bgTo = bgFrom; bgT = 1;
    applyPlanetTheme(bgFrom, [color(245, 145, 149), bgFrom]);
}

function computeLayout() {
    const s = min(windowWidth, windowHeight);
    R = s * 0.44;           // globe radius (original)
    zoom = s * 0.50;
    DOT_PX = constrain(floor(s * 0.06), 36, 96);

    // ⬇️ make planet the same size as the globe (slightly smaller to avoid z-fighting)
    planetR = R * PLANET_SKIN_SCALE;

    // Let the background avoid the globe area:
    if (window.bgSetGlobeMask) {
    window.bgSetGlobeMask(R * 0.66, 0.22, windowWidth/2, windowHeight/2);
  }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    computeLayout();
    planetPG = null; // rebuild planet texture at new size next frame
    if (window.bgSetGlobeMask) {
    window.bgSetGlobeMask(R * 0.66, 0.22, windowWidth/2, windowHeight/2);
  }
}

function makeAnchors() {
    anchors = [];
    for (let i = 0; i < MERIDIANS; i++) {
        const lon0 = (i * PHI) % TWO_PI;
        const u = (i + 0.5) / MERIDIANS;
        const lat0 = asin(2 * u - 1) * 0.55;

        const spd = 0.02 + 0.02 * ((i * 73) % 5);
        const ampLat = 0.05 + 0.02 * ((i * 17) % 4);
        const ampLon = 0.04 + 0.02 * ((i * 29) % 3);

        const rBase = R * DOT_SHELL;                                  // ↑ farther
        const rAmp = R * DOT_SHELL_WOB * (0.6 + 0.4 * (i % 3));      // gentle variance

        const phaseA = i * 0.7, phaseB = i * 0.43 + 0.6, phaseR = i * 0.31 + 1.3;
        anchors.push({ lon0, lat0, spd, ampLat, ampLon, rBase, rAmp, phaseA, phaseB, phaseR });
    }
}


// --- walkers glue (draw() calls these) ---
function updateWalkers() {
    updateWalkerTransition();   // forward to your real updater
}
function drawWalkers() {
    drawWalkerTransition();     // forward to your real drawer
}
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    function hue2rgb(p, q, t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Boost saturation/brightness of a p5 color, returns new p5 color
function boostColor(p5col, satMul = 1.6, lightMul = 1.0, lightBias = 0) {
    const a = alpha(p5col);
    let [h, s, l] = rgbToHsl(red(p5col), green(p5col), blue(p5col));
    s = clamp01(s * satMul);
    l = clamp01(l * lightMul + lightBias);
    const [r, g, b] = hslToRgb(h, s, l);
    return color(r, g, b, a);
}

function draw() {
    // Update persistent walkers (always running)
    updateWalkerTransition();

    //background(isLight ? color(246,248,252) : color(12,16,24));
    // Background lerp (slow → fast during flash; see bgLerpSpeed)
    // background morph
    if (bgT < 1) { bgT += bgLerpSpeed; if (bgT > 1) bgT = 1; }
    const _bgCol = lerpColor(bgFrom, bgTo, bgT);
    if (window.bgSetTint) window.bgSetTint(red(_bgCol), green(_bgCol), blue(_bgCol));
    // keep the main WEBGL canvas transparent so the bg layer shows through
    clear();
    // Particle layer behind everything
    drawWalkerField();
    // 3D camera after ortho pass
    perspective(PI / 3, width / height, 0.01, 10000);
    camera(0, 0, (height / 2) / tan(PI / 6), 0, 0, 0, 0, 1, 0);

    // 3D globe
    push();
    translate(0, 0, -zoom);
    const camYaw = rotY + BASE_YAW;
    rotateY(camYaw);
    rotateZ(TILT_Z);

    // INSERT THIS RIGHT HERE (before you draw rings/dots):
    push();
    drawPlanetLayer();
    pop();
    if (!dragging) rotY += spinVel;
    spinVel *= SPIN_DAMP;

    const gl = drawingContext;
    const lineCol = gridLineCol || (isLight ? color(120, 135, 160, 140) : color(200, 210, 230, 140));
    const rimCol = gridRimCol || (isLight ? color(190, 200, 220, 110) : color(120, 150, 200, 90));


    // wireframe rings (draw with depth off so they read as a grid)
    noFill();
    gl.disable(gl.DEPTH_TEST);
    stroke(lineCol); strokeWeight(1.6);
    for (let r = 0; r < MERIDIANS; r++) { push(); rotateY(r * TWO_PI / MERIDIANS); ellipse(0, 0, R * 2, R * 2); pop(); }
    push(); rotateX(HALF_PI); ellipse(0, 0, R * 2, R * 2); pop();
    stroke(rimCol); strokeWeight(2.0); push(); rotateY(0.52); ellipse(0, 0, R * 2, R * 2); pop();
    gl.enable(gl.DEPTH_TEST);

    // animated dots + labels
    const t = secs();
    for (let i = 0; i < MERIDIANS; i++) {
        const a = anchors[i];
        const lon = a.lon0 + a.spd * t + a.ampLon * 0.5 * sin(0.7 * t + a.phaseB);
        const lat = a.lat0 + a.ampLat * sin(0.9 * t + a.phaseA);
        const rOff = a.rBase + a.rAmp * sin(0.8 * t + a.phaseR);
        const pos = sph(R + rOff, lat, lon);

        push();
        translate(pos.x, pos.y, pos.z);   // translate ONCE

        const isSelected = (selectedHouse === i);
        // soft ambient + two point lights for nice falloff/highlights
        ambientLight(isLight ? 140 : 60);                 // global base light
        pointLight(255, 255, 255, 0, 0, R * 2.2);        // head-on
        pointLight(200, 210, 235, -R * 1.4, R * 0.8, R * 1.0);   // rim/fill
        // the dot
        noStroke();
        // tint to your base color
        const base = isSelected ? color(255, 200, 100) : globeDotColor;

        // lit gradient on the sphere
        ambientMaterial(red(base) * 0.35, green(base) * 0.35, blue(base) * 0.35);
        specularMaterial(red(base), green(base), blue(base)); // colored specular
        shininess(isSelected ? 90 : 55);

        sphere(DOT_PX * (isSelected ? 0.28 : 0.22), 24, 18);  // higher tesselation = smoother

        // face the camera for halo & label (billboard)
        push();
        rotateZ(-TILT_Z);
        rotateY(-(rotY + BASE_YAW));

        // halo only when selected
        if (isSelected) {
            noStroke();
            for (let r2 = DOT_PX * 1.08; r2 >= DOT_PX * 0.4; r2 -= 2) {
                const alpha = map(r2, DOT_PX * 0.4, DOT_PX * 1.08, 180, 12);
                fill(255, 200, 100, alpha);
                ellipse(0, 0, r2, r2);
            }
        }

        // label (depth off just for the glyphs)
        const gl = drawingContext;
        gl.disable(gl.DEPTH_TEST);
        push();
        translate(0, 0, 10);
        const wanted = (labelMode === 'zodiac') ? ZOD[i] : (i + 1).toString();
        const label = (labelMode === 'zodiac' && !hasGlyph(wanted)) ? (i + 1).toString() : wanted;

        textSize(DOT_PX * 0.55);
        textAlign(CENTER, CENTER);
        fill(0, 150);                // drop shadow
        text(label, 2, 2);
        fill(isSelected ? color(255, 200, 100) : color(255));
        text(label, 0, 0);
        pop();
        gl.enable(gl.DEPTH_TEST);

        pop();  // end billboard
        pop();  // end point transform
    }

    // Flash OVER everything
    drawFlashOverlay();
}

function applyPlanetTheme(bg, palettePair /* [c0,c1] */) {
    // Prefer the "other" palette color (not the bg) so we keep contrast
    let base = (palettePair && palettePair.length)
        ? palettePair[0]
        : color(255 - red(bg), 255 - green(bg), 255 - blue(bg));

    // Background luminance (simple luma)
    const L = 0.2126 * red(bg) + 0.7152 * green(bg) + 0.0722 * blue(bg);

    // First ensure contrast vs bg (darken on light bg; brighten on dark bg)
    base = (L > 150)
        ? lerpColor(base, color(0), 0.30)   // darker on light bg
        : lerpColor(base, color(255), 0.28);  // brighter on dark bg

    // Now boost saturation for "bolder" look
    // Tune satMul for more/less pop. 1.6–1.9 is strong, 1.3 is subtle.
    base = boostColor(base, /*satMul*/1.75, /*lightMul*/1.0, /*lightBias*/(L > 150 ? -0.02 : 0.05));

    globeDotColor = base;

    // Stronger, harmonized grid lines that still read on the bg
    const lineMix = (L > 150) ? 0.22 : 0.78; // % pulled toward planet from bg
    const rimMix = (L > 150) ? 0.40 : 0.86;

    gridLineCol = lerpColor(bg, base, lineMix); gridLineCol.setAlpha(170);
    gridRimCol = lerpColor(bg, base, rimMix); gridRimCol.setAlpha(120);

    // Punchier glow for the selected dot (slightly lighter + saturated)
    glowColor = boostColor(lerpColor(base, color(255), 0.25), 1.15, 1.0, 0.9);
}


// ---------- Navigation & panels ----------
function navigateInCurrentMode(direction) {
    selectedHouse = (direction === 'next') ? (selectedHouse + 1) % 12 : (selectedHouse + 11) % 12;
    queuedMode = currentMode;
    queuedIndex = selectedHouse;
    panelOpenQueued = true;           // open after the flash
    startWalkerTransition();
}

function switchToHouseMode() { currentMode = 'house'; labelMode = 'house'; if (!zodiacPanelSaved) closeZodiacInfo(); showHouseInfo(selectedHouse); }
function switchToZodiacMode() { currentMode = 'zodiac'; labelMode = 'zodiac'; if (!housePanelSaved) closeHouseInfo(); showZodiacInfo(selectedHouse); }


function showHouseInfo(houseIndex) {
    var panel = document.getElementById('housePanelRight');
    var content = document.getElementById('houseContentContainer');
    var header = panel.querySelector('.panel-header');
    var info = PLUTO_MEANINGS[houseIndex];


    header.classList.add('glow');
    panel.style.display = 'block';
    setTimeout(function () {
        content.classList.add('expanded');
    }, 100);
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        setTimeout(function () {
            updateHouseContent();
        }, 200);
    } else {
        updateHouseContent();

    }
    var panel = document.getElementById('housePanelRight');
    var content = document.getElementById('houseContentContainer');

    function updateHouseContent() {
        document.getElementById('houseTitleRight').textContent = info.title;

        var contentHTML = '<div class="meaning-section"><strong>Core Transformation:</strong><br>' + info.meaning + '</div>';
        contentHTML += '<div class="info-row"><span class="info-label">House Position</span><span class="info-value">' + (houseIndex + 1) + getOrdinalSuffix(houseIndex + 1) + ' House</span></div>';
        contentHTML += '<div class="info-row"><span class="info-label">Life Area</span><span class="info-value">' + HOUSE_LABELS[houseIndex].split(' • ')[1] + '</span></div>';
        contentHTML += '<div class="traits-list"><div style="font-weight: 600; margin-bottom: 8px; color: #64748b; font-size: 12px; text-transform: uppercase;">Key Traits</div>';

        for (var i = 0; i < info.traits.length; i++) {
            contentHTML += '<div class="trait-item"><span class="info-label">' + info.traits[i] + '</span><span class="info-value">●</span></div>';
        }

        contentHTML += '</div><div class="info-row" style="border-top: 2px solid rgba(0,0,0,0.05); padding-top: 12px; margin-top: 12px;"><span class="info-label">Primary Challenge</span><span class="info-value" style="max-width: 200px; text-align: right; line-height: 1.3;">' + info.challenges + '</span></div>';

        document.getElementById('houseContentRight').innerHTML = contentHTML;

        panel.style.display = 'block';
        setTimeout(function () {
            content.classList.add('expanded');
        }, 100);
        currentHouseIndex = houseIndex;        // remember the chosen house
        window.__opened_showHouseInfo = true;  // mark House panel open (after it animates in)
        setTimeout(maybeStartPlanetAfterPanels, 0);
    }
}

function showZodiacInfo(signIndex) {
    var panel = document.getElementById('zodiacPanelLeft');
    var content = document.getElementById('zodiacContentContainer');
    var header = panel.querySelector('.panel-header');
    var info = PLUTO_IN_SIGNS[signIndex];

    header.classList.add('glow');
    panel.style.display = 'block';
    setTimeout(function () {
        content.classList.add('expanded');
    }, 100);
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        setTimeout(function () {
            updateZodiacContent();
        }, 200);
    } else {
        updateZodiacContent();
    }

    function updateZodiacContent() {
        document.getElementById('zodiacTitleLeft').textContent = info.title;

        var contentHTML = '<div class="meaning-section"><strong>Generational Theme:</strong><br>' + info.meaning + '</div>';
        contentHTML += '<div class="info-row"><span class="info-label">Zodiac Sign</span><span class="info-value">' + ZOD[signIndex] + ' ' + ZODIAC_NAMES[signIndex] + '</span></div>';
        contentHTML += '<div class="info-row"><span class="info-label">Element Influence</span><span class="info-value">' + getZodiacElement(signIndex) + '</span></div>';
        contentHTML += '<div class="traits-list"><div style="font-weight: 600; margin-bottom: 8px; color: #64748b; font-size: 12px; text-transform: uppercase;">Collective Traits</div>';

        for (var i = 0; i < info.traits.length; i++) {
            contentHTML += '<div class="trait-item"><span class="info-label">' + info.traits[i] + '</span><span class="info-value">●</span></div>';
        }

        contentHTML += '</div><div class="info-row" style="border-top: 2px solid rgba(0,0,0,0.05); padding-top: 12px; margin-top: 12px;"><span class="info-label">Evolution Path</span><span class="info-value" style="max-width: 200px; text-align: right; line-height: 1.3;">' + info.challenges + '</span></div>';

        document.getElementById('zodiacContentLeft').innerHTML = contentHTML;

        panel.style.display = 'block';
        setTimeout(function () {
            content.classList.add('expanded');
        }, 100);
        currentZodiacIndex = signIndex;           // remember the chosen zodiac
        window.__opened_showZodiacInfo = true;    // mark zodiac panel as open
        setTimeout(maybeStartPlanetAfterPanels, 0);

    }
}

function getOrdinalSuffix(num) {
    var j = num % 10, k = num % 100;
    if (j == 1 && k != 11) return "st";
    if (j == 2 && k != 12) return "nd";
    if (j == 3 && k != 13) return "rd";
    return "th";
}

function getZodiacElement(signIndex) {
    var elements = ["Fire", "Earth", "Air", "Water", "Fire", "Earth", "Air", "Water", "Fire", "Earth", "Air", "Water"];
    return elements[signIndex];
}

function saveHouseInfo() {
    housePanelSaved = !housePanelSaved;
    var btn = document.getElementById('houseSaveBtn');

    if (housePanelSaved) {
        btn.textContent = 'Saved ✓';
        btn.classList.add('saved');
    } else {
        btn.textContent = 'Save Info';
        btn.classList.remove('saved');
    }
}

function saveZodiacInfo() {
    zodiacPanelSaved = !zodiacPanelSaved;
    var btn = document.getElementById('zodiacSaveBtn');

    if (zodiacPanelSaved) {
        btn.textContent = 'Saved ✓';
        btn.classList.add('saved');
    } else {
        btn.textContent = 'Save Info';
        btn.classList.remove('saved');
    }
}

function closeHouseInfo() {
    housePanelSaved = false;
    var content = document.getElementById('houseContentContainer');
    var panel = document.getElementById('housePanelRight');
    var btn = document.getElementById('houseSaveBtn');

    content.classList.remove('expanded');
    btn.textContent = 'Save Info';
    btn.classList.remove('saved');

    setTimeout(function () {
        panel.style.display = 'none';
    }, 500);

    window.__opened_showHouseInfo = false;
}

function closeZodiacInfo() {
    zodiacPanelSaved = false;
    var content = document.getElementById('zodiacContentContainer');
    var panel = document.getElementById('zodiacPanelLeft');
    var btn = document.getElementById('zodiacSaveBtn');

    content.classList.remove('expanded');
    btn.textContent = 'Save Info';
    btn.classList.remove('saved');

    setTimeout(function () {
        panel.style.display = 'none';
    }, 500);

    window.__opened_showZodiacInfo = false;
}

function closeAllPanels() {
    closeHouseInfo();
    closeZodiacInfo();
}

function updateTheme() {
    const housePanel = document.getElementById('housePanelRight');
    const zodiacPanel = document.getElementById('zodiacPanelLeft');
    const controls = document.getElementById('controls');
    [housePanel, zodiacPanel, controls].forEach(el => { if (!el) return; el.classList.toggle('dark', !isLight); });
    bgFrom = isLight ? color(246, 248, 252) : color(12, 16, 24);
    bgTo = bgFrom; bgT = 1;
    // Seed with a sane default pair
    applyPlanetTheme(bgFrom, [color(245, 145, 149), bgFrom]);
    [housePanel, zodiacPanel, controls].forEach(el => {
        if (!el) return;
        el.classList.toggle('dark', !isLight);
    });
    if (window.bgSetTheme) window.bgSetTheme(isLight ? 'light' : 'dark');
}

function maybeStartPlanetAfterPanels() {
    const hOpen = !!window.__opened_showHouseInfo;
    const zOpen = !!window.__opened_showZodiacInfo;
    if (hOpen && zOpen) {
        startPlanetFormation(currentHouseIndex, currentZodiacIndex);
    }
}

function mousePressed() { dragging = true; px = mouseX; }
function mouseReleased() { dragging = false; }
function mouseDragged() {
    if (!dragging) return;
    const dx = mouseX - px;
    rotY += dx * 0.005;       // same as before
    spinVel = dx * 0.00020;   // give it inertia after release
    px = mouseX;
}
function mouseWheel(e) {
    if (menuIsOpen && menuIsOpen()) return false; // (p5 will also stop default)
    const s = min(windowWidth, windowHeight); zoom = constrain(zoom + e.delta * 0.25, s * 0.4, s * 1.25);
}
function keyPressed() {
    if (menuIsOpen()) return;        // don't let arrows hit the sketch behind the menu
    if (transitionActive) return;    // optional: ignore input during the flash

    if (key === 'd' || key === 'D') { isLight = !isLight; updateTheme(); }
    if (key === 'h' || key === 'H') showHouseNames = !showHouseNames;

    if ((key === 's' || key === 'S') && !isMobileDevice()) {
        savePlutoScreenshot();
    }

    if (keyCode === UP_ARROW) switchToHouseMode();
    if (keyCode === DOWN_ARROW) switchToZodiacMode();
    if (keyCode === LEFT_ARROW) navigateInCurrentMode('prev');
    if (keyCode === RIGHT_ARROW) navigateInCurrentMode('next');
    if (key === 'Escape') closeAllPanels();
}