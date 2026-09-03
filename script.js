// ════════════════════════════════════════════════════════════════
//  CTRL+YAWN 💀 — THE YAWN COURT (script.js)
// ════════════════════════════════════════════════════════════════

import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ── APP STATE ────────────────────────────────────────────────────
const state = {
  yawnCount:    0,
  streak:       0,
  lastYawnTime: 0,
  sessionStart: Date.now(),
  isYawning:    false,
  yawnStart:    0,
  cooldown:     false,
  running:      false,
  soundEnabled: true,
  evidenceList: [],
};

const CONFIG = {
  MAR_THRESHOLD:    0.57,   // Mouth aspect ratio threshold
  MIN_DURATION_MS:  650,    // Minimum sustained opening duration
  COOLDOWN_MS:      2200,   // Cooldown window between yawns
  STREAK_WINDOW_MS: 30000,  // Reset streak if no yawn for 30s
};

// ── EVIDENCE DESCRIPTIONS & JUDGE QUOTES ─────────────────────────
const EVIDENCE_DESCRIPTIONS = [
  "Subject opened mouth suspiciously wide in full view of the court.",
  "Strong physical evidence of drowsiness detected on live camera.",
  "Yawn caught red-handed in high definition (4K).",
  "The defendant repeated the offense despite clear warnings.",
  "Defense counsel offered no logical explanation for mouth expansion.",
  "Contempt of court: Uncontrollable sleepiness in progress.",
  "Eyewitness camera landmarks confirm extreme eyelid droop.",
  "Suspect is clearly resisting productivity.",
];

const JUDGE_REACTIONS = [
  "“YOUR HONOR, THEY DID IT AGAIN!”",
  "“OBJECTION! THAT WAS CLEARLY A YAWN.”",
  "“THE COURT HAS SEEN ENOUGH 💀”",
  "“BRO IS GUILTY.”",
  "“NO FURTHER QUESTIONS.”",
  "“CAUGHT YAWNING IN 4K 📸”",
  "“THE DEFENSE HAS LEFT THE CHAT.”",
  "“YOUR BED IS CALLING.”",
  "“THIS CASE IS GETTING WORSE.”",
  "“SILENCE IN THE COURT! 😭”",
];

const ACHIEVEMENTS = [
  { id: 'first',   icon: '⚖️', name: 'FIRST OFFENCE',         trigger: s => s.yawnCount >= 1 },
  { id: 'again',   icon: '😤', name: 'REPEAT OFFENDER',       trigger: s => s.yawnCount >= 3 },
  { id: 'combo5',  icon: '🔥', name: 'NO REGRETS',             trigger: s => s.yawnCount >= 5 },
  { id: 'pro',     icon: '💀', name: 'PROFESSIONAL SLEEPER',  trigger: s => s.yawnCount >= 10 },
  { id: 'why',     icon: '😭', name: "COURT'S WORST CLIENT",  trigger: s => s.yawnCount >= 15 },
  { id: 'boss',    icon: '👑', name: 'FINAL BOSS OF SLEEP',   trigger: s => s.yawnCount >= 20 },
];

const unlockedAchievements = new Set();

// ── DOM REFS ─────────────────────────────────────────────────────
const videoEl           = document.getElementById('webcam');
const canvasEl          = document.getElementById('canvasOverlay');
const startScreen       = document.getElementById('startScreen');
const errorScreen       = document.getElementById('errorScreen');
const errorMsg          = document.getElementById('errorMsg');
const startBtn          = document.getElementById('startBtn');
const retryBtn          = document.getElementById('retryBtn');
const counterNum        = document.getElementById('counterNum');
const statusBadge       = document.getElementById('statusBadge');
const streakNum         = document.getElementById('streakNum');
const scoreNum          = document.getElementById('scoreNum');
const meterBarInner     = document.getElementById('meterBarInner');
const meterPctText      = document.getElementById('meterPctText');
const tickerText        = document.getElementById('tickerText');
const reactionTicker    = document.getElementById('reactionTicker');
const objectionOverlay  = document.getElementById('objectionOverlay');
const objectionQuote    = document.getElementById('objectionQuote');
const marReadout        = document.getElementById('marReadout');
const verdictBanner     = document.getElementById('verdictBanner');
const evidenceGrid      = document.getElementById('evidenceGrid');
const achievGrid        = document.getElementById('achievementsGrid');
const soundToggleBtn    = document.getElementById('soundToggleBtn');
const resetBtn          = document.getElementById('resetBtn');
const reportBtn         = document.getElementById('reportBtn');
const modalBackdrop     = document.getElementById('modalBackdrop');
const modalClose        = document.getElementById('modalClose');
const reportRows        = document.getElementById('reportRows');
const reportVerdictBox  = document.getElementById('reportVerdictBox');
const judgeStatusBadge  = document.getElementById('judgeStatusBadge');

let ctx = canvasEl.getContext('2d');
let faceLandmarker = null;
let lastVideoTime = -1;

// ── BUILD ACHIEVEMENTS UI ────────────────────────────────────────
function initAchievementsUI() {
  achievGrid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const card = document.createElement('div');
    card.className = 'achieve-card';
    card.id = `ach-${a.id}`;
    card.innerHTML = `
      <div class="achieve-icon">${a.icon}</div>
      <div class="achieve-name">${a.name}</div>
    `;
    achievGrid.appendChild(card);
  });
}
initAchievementsUI();

// ── SOUND SYNTHESIZER (WEB AUDIO API) ─────────────────────────────
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playGavelStrikeSound() {
  if (!state.soundEnabled) return;
  try {
    const ac = getAudioContext();
    const now = ac.currentTime;

    // Wood impact low frequency thump
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    // High wooden crack
    const oscCrack = ac.createOscillator();
    const gainCrack = ac.createGain();
    oscCrack.type = 'square';
    oscCrack.frequency.setValueAtTime(800, now);
    oscCrack.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    gainCrack.gain.setValueAtTime(0.3, now);
    gainCrack.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    oscCrack.connect(gainCrack);
    gainCrack.connect(ac.destination);
    oscCrack.start(now);
    oscCrack.stop(now + 0.08);

  } catch (_) {}
}

// ── 3D COURTROOM JUDGE & GAVEL (THREE.JS) ─────────────────────────
let threeScene, threeCamera, threeRenderer;
let judgeHead, judgeGavel, judgeArm;
let isGavelStriking = false;
let gavelStrikeProgress = 0;

function init3DCourtroom() {
  const container = document.getElementById('canvas3DContainer');
  if (!container || typeof THREE === 'undefined') return;

  const w = container.clientWidth;
  const h = container.clientHeight;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  threeCamera.position.set(0, 0.5, 4.2);

  threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  threeRenderer.setSize(w, h);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(threeRenderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0xfff5e6, 0.6);
  threeScene.add(ambient);

  const goldSpot = new THREE.SpotLight(0xd4af37, 1.2);
  goldSpot.position.set(2, 5, 3);
  threeScene.add(goldSpot);

  const burgundyFill = new THREE.PointLight(0x7a1818, 0.8);
  burgundyFill.position.set(-3, 1, 2);
  threeScene.add(burgundyFill);

  // Group
  const courtGroup = new THREE.Group();
  threeScene.add(courtGroup);

  // Wooden Bench Desk
  const benchGeo = new THREE.BoxGeometry(3.2, 0.8, 1.2);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x251a14, roughness: 0.3 });
  const bench = new THREE.Mesh(benchGeo, benchMat);
  bench.position.set(0, -0.9, 0.5);
  courtGroup.add(bench);

  // Judge Head
  const headGeo = new THREE.SphereGeometry(0.75, 32, 32);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe0b896, roughness: 0.5 });
  judgeHead = new THREE.Mesh(headGeo, headMat);
  judgeHead.position.set(0, 0.3, 0);
  courtGroup.add(judgeHead);

  // Judge Robe (Torso)
  const robeGeo = new THREE.CylinderGeometry(0.7, 0.95, 1.2, 32);
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.8 });
  const robe = new THREE.Mesh(robeGeo, robeMat);
  robe.position.set(0, -0.7, 0);
  courtGroup.add(robe);

  // Judicial Wig
  const wigGeo = new THREE.SphereGeometry(0.82, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const wigMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
  const wig = new THREE.Mesh(wigGeo, wigMat);
  wig.position.set(0, 0.38, 0);
  judgeHead.add(wig);

  // Gavel Block on Bench
  const blockGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.1, 16);
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x3d271d });
  const block = new THREE.Mesh(blockGeo, blockMat);
  block.position.set(0.6, -0.45, 0.9);
  courtGroup.add(block);

  // Gavel Group (Handle + Head)
  judgeGavel = new THREE.Group();

  const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 16);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.rotation.z = Math.PI / 2;
  judgeGavel.add(handle);

  const hammerHeadGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 16);
  const hammerHeadMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.2 });
  const hammerHead = new THREE.Mesh(hammerHeadGeo, hammerHeadMat);
  hammerHead.position.set(0.35, 0, 0);
  judgeGavel.add(hammerHead);

  judgeGavel.position.set(0.6, -0.2, 0.9);
  judgeGavel.rotation.z = 0.3;
  courtGroup.add(judgeGavel);

  // Responsive resize
  window.addEventListener('resize', () => {
    if (!container || !threeRenderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  });

  // Render loop
  let clock = new THREE.Clock();
  function animate3D() {
    requestAnimationFrame(animate3D);

    const t = clock.getElapsedTime();

    // Idle Judge breathing & head tilt
    judgeHead.position.y = 0.3 + Math.sin(t * 1.5) * 0.02;
    judgeHead.rotation.y = Math.sin(t * 0.7) * 0.06;

    // Gavel Slam Action Triggered
    if (isGavelStriking) {
      gavelStrikeProgress += 0.14;
      const angle = Math.sin(Math.min(gavelStrikeProgress, Math.PI)) * 1.2;
      judgeGavel.rotation.z = 0.3 - angle;
      judgeHead.rotation.x = -angle * 0.2;

      if (gavelStrikeProgress >= Math.PI) {
        isGavelStriking = false;
        gavelStrikeProgress = 0;
        judgeGavel.rotation.z = 0.3;
        judgeHead.rotation.x = 0;
      }
    }

    threeRenderer.render(threeScene, threeCamera);
  }
  animate3D();
}

function trigger3DGavelSlam() {
  isGavelStriking = true;
  gavelStrikeProgress = 0;
}

window.addEventListener('DOMContentLoaded', () => {
  init3DCourtroom();
});

// ── STATUS TEXT LOGIC ─────────────────────────────────────────────
function getCourtStatusText(n) {
  if (n === 0)  return 'CASE OPENED 👀';
  if (n <= 2)  return 'SUSPICIOUS 🥱';
  if (n <= 5)  return 'STRONG EVIDENCE 😭';
  if (n <= 9)  return 'EXTREMELY GUILTY 💀';
  return 'THE COURT HAS HAD ENOUGH ⚖️';
}

// ── STATS UPDATE ─────────────────────────────────────────────────
function updateStats() {
  const n = state.yawnCount;

  // Counter
  counterNum.textContent = n;
  counterNum.classList.remove('bump');
  void counterNum.offsetWidth;
  counterNum.classList.add('bump');

  const statusStr = getCourtStatusText(n);
  statusBadge.textContent = statusStr;
  if (judgeStatusBadge) judgeStatusBadge.textContent = statusStr;

  // Streak
  streakNum.textContent = state.streak;

  // Score
  const score = Math.min(100, Math.round(n * 5.2 + state.streak * 3));
  scoreNum.innerHTML = `${score}<span style="font-size:1rem; color:var(--text-muted)">/100</span>`;

  // Meter
  const pct = Math.min(100, Math.round((n / 18) * 100));
  meterBarInner.style.width = `${pct}%`;
  meterPctText.textContent = `${pct}%`;

  // Verdict Banner after 10 yawns
  if (n >= 10) {
    verdictBanner.classList.add('visible');
  }

  checkAchievements();
}

function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!unlockedAchievements.has(a.id) && a.trigger(state)) {
      unlockedAchievements.add(a.id);
      const card = document.getElementById(`ach-${a.id}`);
      if (card) {
        card.classList.add('unlocked');
      }
    }
  });
}

function addEvidenceCard(count) {
  const desc = EVIDENCE_DESCRIPTIONS[Math.floor(Math.random() * EVIDENCE_DESCRIPTIONS.length)];
  const card = document.createElement('div');
  card.className = 'evidence-card';
  card.innerHTML = `
    <div class="evidence-card-num">📁 EVIDENCE #${String(count).padStart(2, '0')}</div>
    <div class="evidence-card-title">🥱 Unauthorized Yawning</div>
    <div class="evidence-card-desc">"${desc}"</div>
  `;
  evidenceGrid.prepend(card);
}

// ── YAWN EVENT HANDLER ───────────────────────────────────────────
function handleYawnDetected() {
  state.yawnCount++;

  const now = Date.now();
  if (now - state.lastYawnTime < CONFIG.STREAK_WINDOW_MS) {
    state.streak++;
  } else {
    state.streak = 1;
  }
  state.lastYawnTime = now;

  updateStats();
  addEvidenceCard(state.yawnCount);
  playGavelStrikeSound();
  trigger3DGavelSlam();
  triggerObjectionBanner();
}

function triggerObjectionBanner() {
  const quote = JUDGE_REACTIONS[Math.floor(Math.random() * JUDGE_REACTIONS.length)];
  objectionQuote.textContent = quote;
  tickerText.textContent = quote;

  objectionOverlay.classList.remove('pop-active');
  void objectionOverlay.offsetWidth;
  objectionOverlay.classList.add('pop-active');

  reactionTicker.classList.add('active-reaction');
  setTimeout(() => reactionTicker.classList.remove('active-reaction'), 4000);
}

// ── MAR COMPUTATION & LANDMARKS ──────────────────────────────────
function distance2D(pt1, pt2) {
  const dx = pt1.x - pt2.x;
  const dy = pt1.y - pt2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeMouthAspectRatio(lm) {
  const v1 = distance2D(lm[13], lm[14]);
  const v2 = distance2D(lm[82], lm[87]);
  const v3 = distance2D(lm[312], lm[317]);
  const vertical = (v1 + v2 + v3) / 3;

  const horizontal = distance2D(lm[61], lm[291]);

  if (horizontal < 0.001) return 0;
  return vertical / horizontal;
}

function drawLandmarksOverlay(faceLandmarks) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (!faceLandmarks || faceLandmarks.length === 0) return;

  const lm = faceLandmarks[0];
  const w = canvasEl.width;
  const h = canvasEl.height;

  const mouthIndices = [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409,
    291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
    13, 14, 87, 317, 82, 312
  ];

  ctx.fillStyle = state.isYawning ? '#ff3333' : '#d4af37';
  ctx.shadowColor = state.isYawning ? 'rgba(255,51,51,0.8)' : 'rgba(212,175,55,0.8)';
  ctx.shadowBlur = 6;

  for (const idx of mouthIndices) {
    const pt = lm[idx];
    if (!pt) continue;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── DETECTION LOOP ───────────────────────────────────────────────
function detectionLoop() {
  if (!state.running) return;

  if (videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;

    canvasEl.width  = videoEl.videoWidth || 640;
    canvasEl.height = videoEl.videoHeight || 480;

    const results = faceLandmarker.detectForVideo(videoEl, performance.now());
    const landmarks = results.faceLandmarks;

    drawLandmarksOverlay(landmarks);

    if (landmarks && landmarks.length > 0) {
      const mar = computeMouthAspectRatio(landmarks[0]);
      marReadout.textContent = `MAR: ${mar.toFixed(2)}`;

      const now = Date.now();

      if (mar > CONFIG.MAR_THRESHOLD) {
        if (!state.isYawning && !state.cooldown) {
          state.isYawning = true;
          state.yawnStart = now;
        } else if (state.isYawning && !state.cooldown) {
          const duration = now - state.yawnStart;
          if (duration >= CONFIG.MIN_DURATION_MS) {
            state.isYawning = false;
            state.cooldown = true;
            handleYawnDetected();
            setTimeout(() => { state.cooldown = false; }, CONFIG.COOLDOWN_MS);
          }
        }
      } else {
        state.isYawning = false;
      }
    } else {
      marReadout.textContent = "MAR: 0.00";
      state.isYawning = false;
    }
  }

  requestAnimationFrame(detectionLoop);
}

// ── INIT MEDIAPIPE & CAMERA ──────────────────────────────────────
async function initMediaPipeModel() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    outputFaceBlendshapes: false,
    runningMode: "VIDEO",
    numFaces: 1
  });
}

async function startCameraScanner() {
  startBtn.disabled = true;
  startBtn.textContent = "LOADING COURT CAMERA...";

  try {
    await initMediaPipeModel();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    videoEl.srcObject = stream;
    await new Promise(res => { videoEl.onloadedmetadata = res; });
    await videoEl.play();

    startScreen.classList.add('hidden');
    state.running = true;
    detectionLoop();
  } catch (err) {
    console.error(err);
    errorMsg.textContent = err.name === 'NotAllowedError'
      ? '🚫 Camera access denied. Please allow camera access for evidence monitoring.'
      : `🚫 Could not start camera: ${err.message || 'Error'}`;
    errorScreen.classList.add('visible');
    startBtn.disabled = false;
    startBtn.textContent = "ENTER THE COURTROOM ⚖️";
  }
}

// ── CONTROLS & CASE REPORT ───────────────────────────────────────
function resetSession() {
  state.yawnCount = 0;
  state.streak = 0;
  state.lastYawnTime = 0;
  state.sessionStart = Date.now();
  state.isYawning = false;
  state.cooldown = false;

  unlockedAchievements.clear();
  document.querySelectorAll('.achieve-card').forEach(c => c.classList.remove('unlocked'));

  counterNum.textContent = '0';
  statusBadge.textContent = 'CASE OPENED 👀';
  if (judgeStatusBadge) judgeStatusBadge.textContent = 'CASE OPENED 👀';
  streakNum.textContent = '0';
  scoreNum.innerHTML = '0<span style="font-size:1rem; color:var(--text-muted)">/100</span>';
  meterBarInner.style.width = '0%';
  meterPctText.textContent = '0%';
  verdictBanner.classList.remove('visible');
  evidenceGrid.innerHTML = '';
  tickerText.textContent = 'Court is in session. Waiting for evidence... ⚖️';
}

function generateCaseReport() {
  const elapsedSecs = Math.round((Date.now() - state.sessionStart) / 1000);
  const mins = Math.floor(elapsedSecs / 60);
  const secs = elapsedSecs % 60;
  const rate = elapsedSecs > 0 ? (state.yawnCount / (elapsedSecs / 60)).toFixed(1) : '0.0';

  const rows = [
    ['Case Identifier', `#CTRL-YAWN-${Math.floor(100 + Math.random() * 900)}`],
    ['Defendant', 'User (On Trial)'],
    ['Evidence Pieces', `${state.yawnCount} Yawns`],
    ['Best Yawn Streak', `${state.streak} 🔥`],
    ['Sleepiness Score', `${Math.min(100, Math.round(state.yawnCount * 5.2))}/100`],
    ['Trial Duration', `${mins}m ${secs}s (${rate} yawns/min)`],
    ['Case Status', getCourtStatusText(state.yawnCount)],
    ['Achievements Earned', `${unlockedAchievements.size}/${ACHIEVEMENTS.length}`],
  ];

  reportRows.innerHTML = rows.map(([lbl, val]) => `
    <tr>
      <td>${lbl}</td>
      <td>${val}</td>
    </tr>
  `).join('');

  reportVerdictBox.innerHTML = `
    <strong>VERDICT: GUILTY OF BEING SLEEPY 💀</strong><br>
    SENTENCE: GO TO BED IMMEDIATELY 🛏️<br><br>
    <em>"Congratulations. You have successfully wasted your time measuring yawns."</em>
  `;

  modalBackdrop.classList.add('open');
}

// Sound toggle
soundToggleBtn.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  soundToggleBtn.textContent = state.soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF';
});

// Event bindings
startBtn.addEventListener('click', startCameraScanner);
retryBtn.addEventListener('click', () => {
  errorScreen.classList.remove('visible');
  startCameraScanner();
});
resetBtn.addEventListener('click', resetSession);
reportBtn.addEventListener('click', generateCaseReport);
modalClose.addEventListener('click', () => modalBackdrop.classList.remove('open'));
modalBackdrop.addEventListener('click', e => {
  if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
});
