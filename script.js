// ════════════════════════════════════════════════════════════════
//  CTRL+YAWN 💀 — THE YAWN COURT (script.js)
//  Complete rewrite: tabs, intro, better detection, realistic 3D
// ════════════════════════════════════════════════════════════════

// ── APP STATE ────────────────────────────────────────────────────
var state = {
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

// ── DETECTION CONFIG ─────────────────────────────────────────────
// Uses MediaPipe jawOpen blendshape score (0.0–1.0, no calibration needed).
var CONFIG = {
  // ─ jawOpen blendshape thresholds (0.0 – 1.0) ─
  // jawOpen ~ 0.0 = closed mouth, ~ 1.0 = fully open.
  // A normal yawn usually scores 0.5–0.8.
  JAW_OPEN_THRESHOLD:   0.45,  // [TUNABLE] Score above this = yawn-sized opening
  JAW_OPEN_POSSIBLE:    0.45,  // [TUNABLE] Only analyze when mouth is widely open

  // ─ Time-based confirmation gate ─
  // jawOpen must stay above JAW_OPEN_THRESHOLD for this many milliseconds.
  CONFIRM_YAWN_MS:      250,   // [TUNABLE] Time to hold yawn to confirm

  // ─ Smoothing ─
  SMOOTH_FRAMES:        2,     // [TUNABLE] Rolling average window (low = responsive, high = stable)

  // ─ Cooldown ─
  COOLDOWN_MS:          3500,  // [TUNABLE] Pause between detected yawns (ms)
  STREAK_WINDOW_MS:     30000,

  // ─ Debug mode ─
  DEBUG:                true,   // logs jawOpen score every frame to browser console
};

// ── LEADERBOARD DATA ─────────────────────────────────────────────
var DEFAULT_LEADERBOARD = [
  { name: "Rahul",  yawns: 20 },
  { name: "Priya",  yawns: 15 },
  { name: "Anu",    yawns: 8  },
  { name: "Dev",    yawns: 6  },
  { name: "Sam",    yawns: 4  },
];

function getLeaderboardData() {
  // Clear any old formats that might contain 'Sayooj'
  localStorage.removeItem('yawn_court_leaderboard');
  var saved = localStorage.getItem('yawn_court_leaderboard_v3');
  if (saved) { try { return JSON.parse(saved); } catch (_) {} }
  return DEFAULT_LEADERBOARD.map(function(x) { return Object.assign({}, x); });
}
function saveLeaderboardData(list) {
  localStorage.setItem('yawn_court_leaderboard_v3', JSON.stringify(list));
}

// ── EVIDENCE & JUDGE QUOTES ───────────────────────────────────────
var EVIDENCE_DESCRIPTIONS = [
  "Subject opened mouth suspiciously wide in full view of the court.",
  "Strong physical evidence of drowsiness detected on live camera.",
  "Yawn caught red-handed in high definition (4K).",
  "The defendant repeated the offense despite clear warnings.",
  "Defense counsel offered no logical explanation for mouth expansion.",
  "Contempt of court: Uncontrollable sleepiness in progress.",
  "Eyewitness camera landmarks confirm extreme eyelid droop.",
  "Suspect is clearly resisting productivity.",
  "Physical evidence of fatigue documented at timestamp.",
  "Subject failed to suppress yawn despite legal counsel.",
];

var JUDGE_REACTIONS = [
  "WAKE UP BRO! YOU ARE ON TRIAL! 😭",
  "OBJECTION! THAT WAS CLEARLY A YAWN! 🚨",
  "BRO REALLY YAWNED AGAIN! 🔨💀",
  "PRODUCTIVITY HAS LEFT THE CHAT! 🏃",
  "YOUR BED MISSES YOU BRO! 🛏️",
  "CAUGHT YAWNING IN 4K! 📸💀",
  "SILENCE IN THE COURTROOM! 😭",
  "BRO NEEDS A TOTAL RESTART! 🔄",
  "JUST GO TO BED BRO! 🥱",
  "RATIO'D BY YOUR OWN SLEEPINESS! 💀",
];

var ACHIEVEMENTS = [
  { id: 'first',  icon: '⚖️', name: 'FIRST OFFENCE',        trigger: function(s) { return s.yawnCount >= 1; } },
  { id: 'again',  icon: '😤', name: 'REPEAT OFFENDER',      trigger: function(s) { return s.yawnCount >= 3; } },
  { id: 'five',   icon: '🔥', name: 'NO REGRETS',           trigger: function(s) { return s.yawnCount >= 5; } },
  { id: 'pro',    icon: '💀', name: 'PROFESSIONAL SLEEPER', trigger: function(s) { return s.yawnCount >= 10; } },
  { id: 'why',    icon: '😭', name: "COURT'S WORST CLIENT", trigger: function(s) { return s.yawnCount >= 15; } },
  { id: 'boss',   icon: '👑', name: 'FINAL BOSS OF SLEEP',  trigger: function(s) { return s.yawnCount >= 20; } },
];

var unlockedAchievements = new Set();
var faceLandmarker = null;
var lastVideoTime = -1;

// ── YAWN DETECTION STATE MACHINE ─────────────────────────────────
// States: 'IDLE' → 'POSSIBLE' → 'OPEN' → 'CLOSING' → back to IDLE
// Only CLOSING→IDLE transition (after sustained open + close) fires handleYawnDetected()
var yawnFSM = {
  state:           'IDLE',
  stateEnteredAt:  0,
  yawnThrEnteredAt: 0,         // timestamp when smoothMAR specifically crossed yawnThr
  bestJawScore:   0,           // tracks highest openness during current yawn
  bestPhotoUrl:   null,        // stores the photo taken at maximum openness
  confirmedAt:    0,           // timestamp when OPEN was confirmed
  cooldown:        false,

  // Calibration (kept for fallback compatibility)
  calibrated:      false,
  calibStartTime:  0,
  calibFrames:     [],
  baselineMAR:     0.05,

  // Rolling average
  marHistory:      [],
  smoothMAR:       0,

  // Face tracking
  faceVisible:     false,
  noFaceFrames:    0,
};

// ── DOM REFS ──────────────────────────────────────────────────────
var els = {};
function grabDOMRefs() {
  var ids = [
    'webcam','canvasOverlay','startScreen','errorScreen','errorMsg',
    'startBtn','counterNum','courtYawnCount','headerYawnCount','statusBadge',
    'streakNum','scoreNum','sessionTimeNum','yawnRateNum','meterBarInner',
    'meterPctText','tickerText','reactionTicker','objectionOverlay',
    'objectionQuote','marReadout','verdictBanner','evidenceGrid',
    'evidenceCount','achievementsGrid','soundToggleBtn','leaderboardBody',
    'modalBackdrop','reportRows','reportVerdictBox','judgeStatusBadge',
    'judgeVerdictBadge','scannerStatusText','canvas3DContainer'
  ];
  ids.forEach(function(id) { els[id] = document.getElementById(id); });
  if (els.canvasOverlay) {
    els.ctx = els.canvasOverlay.getContext('2d');
  }
}

// ── TABS ──────────────────────────────────────────────────────────
window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById('tab-' + tabName);
  if (panel) panel.classList.add('active');
  var btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
  if (btn) btn.classList.add('active');
  // If switching to stats, update session time
  if (tabName === 'stats') updateSessionTime();
};

function updateSessionTime() {
  var elapsed = Math.round((Date.now() - state.sessionStart) / 1000);
  var m = Math.floor(elapsed / 60);
  var s = elapsed % 60;
  if (els.sessionTimeNum) els.sessionTimeNum.textContent = m + 'm ' + s + 's';
  var rate = elapsed > 10 ? (state.yawnCount / (elapsed / 60)).toFixed(1) : '0.0';
  if (els.yawnRateNum) els.yawnRateNum.textContent = rate;
}

// ── ACHIEVEMENTS UI ───────────────────────────────────────────────
function initAchievementsUI() {
  var grid = els.achievementsGrid;
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(function(a) {
    var card = document.createElement('div');
    card.className = 'achieve-card';
    card.id = 'ach-' + a.id;
    card.innerHTML = '<div class="achieve-icon">' + a.icon + '</div><div class="achieve-name">' + a.name + '</div>';
    grid.appendChild(card);
  });
}

// ── LEADERBOARD ───────────────────────────────────────────────────
function renderLeaderboard() {
  if (!els.leaderboardBody) return;
  var list = getLeaderboardData();
  var idx = list.findIndex(function(e) { return e.name === 'You (Defendant)'; });
  if (idx >= 0) list[idx].yawns = state.yawnCount;
  else list.push({ name: 'You (Defendant)', yawns: state.yawnCount });
  list.sort(function(a, b) { return b.yawns - a.yawns; });
  var medals = ['🥇', '🥈', '🥉'];
  saveLeaderboardData(list);
  els.leaderboardBody.innerHTML = list.map(function(item, i) {
    var isUser = item.name.includes('You');
    var medal  = i < 3 ? medals[i] : (i + 1) + 'th';
    var cls    = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
    return '<tr class="' + (isUser ? 'rank-user' : '') + '"><td class="' + cls + '">' + medal + '</td><td>' + item.name + '</td><td>' + item.yawns + ' Yawns 💀</td></tr>';
  }).join('');
}

// ── SOUND ─────────────────────────────────────────────────────────
var audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playGavelStrike() {
  if (!state.soundEnabled) return;
  try {
    var ac  = getAudioCtx();
    var now = ac.currentTime;
    // Thud
    var o1 = ac.createOscillator(), g1 = ac.createGain();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(180, now);
    o1.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    g1.gain.setValueAtTime(0.7, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    o1.connect(g1); g1.connect(ac.destination);
    o1.start(now); o1.stop(now + 0.22);
    // Crack
    var o2 = ac.createOscillator(), g2 = ac.createGain();
    o2.type = 'square';
    o2.frequency.setValueAtTime(900, now);
    o2.frequency.exponentialRampToValueAtTime(150, now + 0.06);
    g2.gain.setValueAtTime(0.35, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    o2.connect(g2); g2.connect(ac.destination);
    o2.start(now); o2.stop(now + 0.1);
  } catch (_) {}
}

function speakJudgeQuote(text) {
  if (!state.soundEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  var utt = new SpeechSynthesisUtterance(text);
  utt.pitch = 0.6;
  utt.rate = 1.05;
  utt.volume = 1.0;
  var voices = window.speechSynthesis.getVoices();
  var deepV = voices.find(function(v) {
    var n = v.name.toLowerCase();
    return n.includes('uk') || n.includes('british') || n.includes('male') || n.includes('david') || n.includes('george');
  });
  if (deepV) utt.voice = deepV;
  window.speechSynthesis.speak(utt);
}

// ── 3D INTRO YAWNING HUMAN ────────────────────────────────────────
var introScene, introCamera, introRenderer, introAnimId;
var introHumanParts = {};

function initIntro3D() {
  var container = document.getElementById('introCanvas3D');
  if (!container || typeof THREE === 'undefined') return;

  var w = container.clientWidth || window.innerWidth;
  var h = container.clientHeight || window.innerHeight;

  introScene = new THREE.Scene();
  introCamera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  introCamera.position.set(0, 0.45, 3.6);

  introRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  introRenderer.setSize(w, h);
  introRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(introRenderer.domElement);

  // Lighting
  introScene.add(new THREE.AmbientLight(0xfff3d0, 0.6));
  var spot = new THREE.SpotLight(0xd4af37, 2.5);
  spot.position.set(0, 8, 5);
  spot.angle = 0.35;
  introScene.add(spot);
  var fill = new THREE.PointLight(0x7a1818, 1.0);
  fill.position.set(-4, 2, 3);
  introScene.add(fill);

  var skinMat  = new THREE.MeshStandardMaterial({ color: 0xe8c49a, roughness: 0.5 });
  var darkMat  = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.8 });
  var hairMat  = new THREE.MeshStandardMaterial({ color: 0x1a0e00, roughness: 0.8 });
  var shirtMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.7 });

  var human = new THREE.Group();
  human.position.set(0, 0.15, 0);
  introScene.add(human);

  // Torso
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.60, 1.1, 16), shirtMat);
  torso.position.y = -0.3;
  human.add(torso);

  // Neck
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.28, 12), skinMat);
  neck.position.y = 0.42;
  human.add(neck);

  // Head
  var head = new THREE.Group();
  head.position.y = 0.85;
  human.add(head);
  introHumanParts.head = head;

  var headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), skinMat);
  head.add(headMesh);

  // Hair
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.57, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
  hair.position.y = 0.06;
  head.add(hair);

  // Eyebrows
  var browMat = new THREE.MeshBasicMaterial({ color: 0x1a0e00 });
  [-0.22, 0.22].forEach(function(x) {
    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), browMat);
    brow.position.set(x, 0.22, 0.5);
    head.add(brow);
  });

  // Eyes (open/close with eyelids)
  var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var irisMat     = new THREE.MeshBasicMaterial({ color: 0x1a0e00 });
  var eyelidMat   = new THREE.MeshStandardMaterial({ color: 0xe8c49a, roughness: 0.5 });

  introHumanParts.eyeGroups = [];
  [-0.22, 0.22].forEach(function(x) {
    var eg = new THREE.Group();
    eg.position.set(x, 0.1, 0.48);
    head.add(eg);
    introHumanParts.eyeGroups.push(eg);

    var white = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), eyeWhiteMat);
    eg.add(white);
    var iris = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), irisMat);
    iris.position.z = 0.06;
    eg.add(iris);
    // Upper eyelid
    var lid = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), eyelidMat);
    lid.rotation.x = Math.PI;
    lid.position.y = 0.01;
    eg.add(lid);
    eg.userData.lid = lid;
  });

  // Nose
  var noseMat = new THREE.MeshStandardMaterial({ color: 0xd4a57a, roughness: 0.6 });
  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), noseMat);
  nose.scale.set(1, 0.7, 0.8);
  nose.position.set(0, -0.06, 0.52);
  head.add(nose);

  // Jaw (animated for mouth opening)
  var jaw = new THREE.Group();
  jaw.position.set(0, -0.22, 0);
  head.add(jaw);
  introHumanParts.jaw = jaw;

  var lowerFace = new THREE.Mesh(new THREE.SphereGeometry(0.47, 32, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), skinMat);
  jaw.add(lowerFace);

  // Mouth opening (dark cavity)
  var mouthHole = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshBasicMaterial({ color: 0x0a0000 })
  );
  mouthHole.rotation.x = -Math.PI / 2;
  mouthHole.position.set(0, 0.18, 0.35);
  jaw.add(mouthHole);
  introHumanParts.mouthHole = mouthHole;

  // Tongue
  var tongue = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8), new THREE.MeshStandardMaterial({ color: 0xe03c5a, roughness: 0.4 }));
  tongue.scale.set(1, 0.45, 1);
  tongue.position.set(0, 0.08, 0.42);
  jaw.add(tongue);
  introHumanParts.tongue = tongue;

  // Arms (yawn stretch)
  introHumanParts.arms = [];
  [[-1, -1], [1, 1]].forEach(function(pair) {
    var side = pair[0], dir = pair[1];
    var arm = new THREE.Group();
    arm.position.set(side * 0.6, -0.05, 0);
    human.add(arm);
    introHumanParts.arms.push(arm);

    var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.65, 12), skinMat);
    upper.position.set(side * 0.15, 0, 0);
    upper.rotation.z = dir * 0.6;
    arm.add(upper);

    var lower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.6, 12), skinMat);
    lower.position.set(side * 0.5, 0.2, 0);
    lower.rotation.z = dir * 0.4;
    arm.add(lower);
  });

  introHumanParts.human = human;

  // Gold particles in the background
  var particleGeo = new THREE.BufferGeometry();
  var pCount = 120;
  var pPositions = new Float32Array(pCount * 3);
  for (var i = 0; i < pCount; i++) {
    pPositions[i * 3]     = (Math.random() - 0.5) * 14;
    pPositions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 4;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  var particleMat = new THREE.PointsMaterial({ color: 0xd4af37, size: 0.04, transparent: true, opacity: 0.55 });
  introScene.add(new THREE.Points(particleGeo, particleMat));

  var clock = new THREE.Clock();
  function animateIntro() {
    introAnimId = requestAnimationFrame(animateIntro);
    var t = clock.getElapsedTime();

    // Continuous yawn cycle: 4s period
    var cycle = (t % 4) / 4; // 0→1 in 4s
    // Yawn shape: ramp up from 0.2 to 0.6, hold, ramp down to 1.0
    var yawnAmt = 0;
    if (cycle < 0.25)      yawnAmt = cycle / 0.25;          // opening
    else if (cycle < 0.65) yawnAmt = 1.0;                   // full open
    else                   yawnAmt = 1.0 - (cycle - 0.65) / 0.35; // closing

    yawnAmt = Math.max(0, Math.min(1, yawnAmt));

    // Head tilt back
    if (introHumanParts.head) {
      introHumanParts.head.rotation.x = -yawnAmt * 0.38;
      introHumanParts.head.position.y = 0.85 + yawnAmt * 0.04;
    }

    // Jaw drops
    if (introHumanParts.jaw) {
      introHumanParts.jaw.rotation.x = yawnAmt * 0.55;
    }

    // Mouth hole grows
    if (introHumanParts.mouthHole) {
      introHumanParts.mouthHole.scale.set(1 + yawnAmt * 1.2, 1 + yawnAmt * 0.8, 1);
    }

    // Eyes close during yawn
    introHumanParts.eyeGroups && introHumanParts.eyeGroups.forEach(function(eg) {
      var lid = eg.userData.lid;
      if (lid) lid.scale.y = 1 + yawnAmt * 3.5;
    });

    // Arms stretch up
    if (introHumanParts.arms) {
      introHumanParts.arms[0].rotation.z = yawnAmt * -1.1;
      introHumanParts.arms[1].rotation.z = yawnAmt * 1.1;
      introHumanParts.arms.forEach(function(a) {
        a.position.y = -0.05 + yawnAmt * 0.25;
      });
    }

    // Subtle body sway
    if (introHumanParts.human) {
      introHumanParts.human.rotation.y = Math.sin(t * 0.4) * 0.08;
      introHumanParts.human.position.y = Math.sin(t * 0.9) * 0.03;
    }

    introRenderer.render(introScene, introCamera);
  }
  animateIntro();
}

function cleanupIntro3D() {
  if (introAnimId) cancelAnimationFrame(introAnimId);
  if (introRenderer) introRenderer.dispose();
}

// ── INTRO PARTICLES (DOM) ─────────────────────────────────────────
function spawnParticles() {
  var container = document.getElementById('introParticles');
  if (!container) return;
  for (var i = 0; i < 35; i++) {
    (function(i) {
      setTimeout(function() {
        var p = document.createElement('div');
        p.className = 'particle';
        p.style.left = (Math.random() * 100) + '%';
        p.style.bottom = '-10px';
        p.style.animationDuration = (4 + Math.random() * 6) + 's';
        p.style.animationDelay = '0s';
        p.style.opacity = Math.random() * 0.7 + 0.2;
        container.appendChild(p);
        setTimeout(function() { p.remove(); }, 12000);
      }, i * 200);
    })(i);
  }
}

// ── DISMISS INTRO ─────────────────────────────────────────────────
window.dismissIntro = function() {
  var splash = document.getElementById('introSplash');
  var app    = document.getElementById('app');
  if (splash) {
    splash.style.transition = 'opacity 0.7s ease';
    splash.style.opacity = '0';
    setTimeout(function() {
      splash.style.display = 'none';
      cleanupIntro3D();
    }, 700);
  }
  if (app) {
    app.style.display = 'flex';
    // Grab refs and init
    grabDOMRefs();
    initAchievementsUI();
    renderLeaderboard();
    init3DCourtroom();
    // Auto-start camera and yawn scanner immediately!
    window.startCourtroomScanner();
  }
};

// ── 3D COURTROOM JUDGE + WITNESS ─────────────────────────────────
var three = {}; // scene, camera, renderer, parts
var animState = {
  gavelAngle: 0,
  isStriking: false,
  progress:   0,
};

function init3DCourtroom() {
  var container = els.canvas3DContainer || document.getElementById('canvas3DContainer');
  if (!container || typeof THREE === 'undefined') return;

  // Wait for container to have size
  var w = container.clientWidth  || 340;
  var h = container.clientHeight || 280;
  if (w < 10) { setTimeout(init3DCourtroom, 80); return; }

  three.scene = new THREE.Scene();
  three.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  three.camera.position.set(0, 0.8, 5.2);

  three.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  three.renderer.setSize(w, h);
  three.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  three.renderer.shadowMap.enabled = true;
  container.appendChild(three.renderer.domElement);

  // Lighting
  three.scene.add(new THREE.AmbientLight(0xfff5e0, 0.65));
  var key = new THREE.SpotLight(0xd4af37, 1.8);
  key.position.set(2, 6, 4); key.angle = 0.45;
  three.scene.add(key);
  var fill = new THREE.PointLight(0x7a1818, 0.9);
  fill.position.set(-4, 2, 3);
  three.scene.add(fill);
  var back = new THREE.PointLight(0x2a1408, 0.5);
  back.position.set(0, -2, -4);
  three.scene.add(back);

  buildCourtroom();

  window.addEventListener('resize', function() {
    if (!container || !three.renderer) return;
    var nw = container.clientWidth;
    var nh = container.clientHeight;
    three.camera.aspect = nw / nh;
    three.camera.updateProjectionMatrix();
    three.renderer.setSize(nw, nh);
  });

  var clock = new THREE.Clock();
  function renderLoop() {
    requestAnimationFrame(renderLoop);
    var t = clock.getElapsedTime();
    animateScene(t);
    three.renderer.render(three.scene, three.camera);
  }
  renderLoop();
}

function buildCourtroom() {
  var s = three.scene;

  // Materials
  var skinMat    = new THREE.MeshStandardMaterial({ color: 0xe0c090, roughness: 0.45 });
  var darkRobe   = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.85 });
  var wigMat     = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.9 });
  var goldMat    = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
  var woodMat    = new THREE.MeshStandardMaterial({ color: 0x251a14, roughness: 0.4 });
  var darkEye    = new THREE.MeshBasicMaterial({ color: 0x111111 });
  var whiteEye   = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var pinkMat    = new THREE.MeshStandardMaterial({ color: 0xe04060, roughness: 0.5 });
  var witnessSkinMat = new THREE.MeshStandardMaterial({ color: 0xf5c990, roughness: 0.4 });
  var witnessShirt   = new THREE.MeshStandardMaterial({ color: 0x8b1c1c, roughness: 0.7 });

  // ── BENCH / DESK ──────────────────────────────────────────────
  var bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.65, 1.0), woodMat);
  bench.position.set(0, -1.1, 0.4);
  s.add(bench);
  var benchFront = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 0.08), woodMat);
  benchFront.position.set(0, -1.2, 0.95);
  s.add(benchFront);

  // ── JUDGE (LEFT) ───────────────────────────────────────────────
  var judgeGroup = new THREE.Group();
  judgeGroup.position.set(-1.1, 0, 0);
  s.add(judgeGroup);
  three.judgeGroup = judgeGroup;

  // Robe body
  var robeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 1.3, 16), darkRobe);
  robeBody.position.y = -0.7;
  judgeGroup.add(robeBody);

  // Collar / white trim
  var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.22, 16), wigMat);
  collar.position.y = 0.05;
  judgeGroup.add(collar);

  // Neck
  var judgeNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 12), skinMat);
  judgeNeck.position.y = 0.3;
  judgeGroup.add(judgeNeck);

  // Head
  var judgeHead = new THREE.Group();
  judgeHead.position.y = 0.72;
  judgeGroup.add(judgeHead);
  three.judgeHead = judgeHead;

  var jHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 24), skinMat);
  judgeHead.add(jHeadMesh);

  // Wig
  var wigBase = new THREE.Mesh(new THREE.SphereGeometry(0.66, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), wigMat);
  wigBase.position.y = 0.05;
  judgeHead.add(wigBase);

  // Wig curls (little spheres along top)
  var curlPositions = [
    [-0.35, 0.45, 0.3],[-0.18, 0.6, 0.2],[0, 0.64, 0.15],[0.18, 0.6, 0.2],[0.35, 0.45, 0.3],
    [-0.5, 0.2, 0.15],[0.5, 0.2, 0.15]
  ];
  curlPositions.forEach(function(cp) {
    var curl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), wigMat);
    curl.position.set(cp[0], cp[1], cp[2]);
    judgeHead.add(curl);
  });

  // Judge Eyes
  [-0.22, 0.22].forEach(function(x) {
    var white = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), whiteEye);
    white.position.set(x, 0.12, 0.55);
    judgeHead.add(white);
    var iris = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), darkEye);
    iris.position.set(x, 0.12, 0.61);
    judgeHead.add(iris);
    // eyebrow
    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    brow.position.set(x, 0.27, 0.58);
    brow.rotation.z = (x < 0 ? 1 : -1) * 0.1;
    judgeHead.add(brow);
  });

  // Judge Nose
  var jNose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcca070, roughness: 0.5 }));
  jNose.scale.set(1, 0.65, 0.85);
  jNose.position.set(0, -0.02, 0.6);
  judgeHead.add(jNose);

  // Judge Mouth (closed stern line)
  var jMouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x8b5030 }));
  jMouth.position.set(0, -0.2, 0.6);
  judgeHead.add(jMouth);

  // Judge Mustache
  var mustL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.7 }));
  mustL.rotation.z = Math.PI / 2;
  mustL.position.set(-0.12, -0.13, 0.61);
  judgeHead.add(mustL);
  var mustR = mustL.clone();
  mustR.position.set(0.12, -0.13, 0.61);
  judgeHead.add(mustR);

  // ── GAVEL ──────────────────────────────────────────────────────
  var gavelGroup = new THREE.Group();
  gavelGroup.position.set(-0.55, -0.5, 0.85);
  gavelGroup.rotation.z = 0.35;
  s.add(gavelGroup);
  three.gavelGroup = gavelGroup;

  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), goldMat);
  handle.rotation.z = Math.PI / 2;
  gavelGroup.add(handle);

  var head1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), woodMat);
  head1.position.set(0.38, 0, 0);
  head1.rotation.z = Math.PI / 2;
  gavelGroup.add(head1);

  // Gavel block (on bench)
  var gBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 12), woodMat);
  gBlock.position.set(-0.55, -0.78, 0.85);
  s.add(gBlock);

  // ── WITNESS / YAWNING HUMAN (RIGHT) ────────────────────────────
  var witnessGroup = new THREE.Group();
  witnessGroup.position.set(1.1, 0, 0.2);
  s.add(witnessGroup);
  three.witnessGroup = witnessGroup;

  // Torso
  var wTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 16), witnessShirt);
  wTorso.position.y = -0.5;
  witnessGroup.add(wTorso);

  // Neck
  var wNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.25, 12), witnessSkinMat);
  wNeck.position.y = 0.2;
  witnessGroup.add(wNeck);

  // Head
  var witnessHead = new THREE.Group();
  witnessHead.position.y = 0.6;
  witnessGroup.add(witnessHead);
  three.witnessHead = witnessHead;

  var wHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.52, 32, 24), witnessSkinMat);
  witnessHead.add(wHeadMesh);

  // Hair
  var wHair = new THREE.Mesh(new THREE.SphereGeometry(0.545, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), new THREE.MeshStandardMaterial({ color: 0x2a1500, roughness: 0.8 }));
  wHair.position.y = 0.06;
  witnessHead.add(wHair);

  // Witness Eyes
  three.witnessEyes = [];
  [-0.21, 0.21].forEach(function(x) {
    var eg = new THREE.Group();
    eg.position.set(x, 0.1, 0.44);
    witnessHead.add(eg);

    var white = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), whiteEye);
    eg.add(white);
    var iris = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), darkEye);
    iris.position.z = 0.05;
    eg.add(iris);
    // Eyelid
    var lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xf0c080, roughness: 0.5 })
    );
    lid.rotation.x = Math.PI;
    eg.add(lid);
    eg.userData.lid = lid;
    three.witnessEyes.push(eg);
  });

  // Witness nose
  var wNoseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdfa060 }));
  wNoseMesh.scale.set(1, 0.65, 0.85);
  wNoseMesh.position.set(0, -0.03, 0.5);
  witnessHead.add(wNoseMesh);

  // Witness Jaw (animated)
  var witnessJaw = new THREE.Group();
  witnessJaw.position.set(0, -0.18, 0);
  witnessHead.add(witnessJaw);
  three.witnessJaw = witnessJaw;

  var wLowerFace = new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 32, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    witnessSkinMat
  );
  witnessJaw.add(wLowerFace);

  // Mouth hole
  var wMouthHole = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshBasicMaterial({ color: 0x050000 })
  );
  wMouthHole.rotation.x = -Math.PI / 2;
  wMouthHole.position.set(0, 0.16, 0.32);
  witnessJaw.add(wMouthHole);
  three.witnessMouthHole = wMouthHole;

  // Tongue
  var wTongue = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 8),
    pinkMat
  );
  wTongue.scale.set(1, 0.4, 1);
  wTongue.position.set(0, 0.07, 0.38);
  witnessJaw.add(wTongue);

  // Witness Arms
  three.witnessArms = [];
  [[-1, -1], [1, 1]].forEach(function(pair) {
    var side = pair[0], dir = pair[1];
    var armG = new THREE.Group();
    armG.position.set(side * 0.55, -0.2, 0);
    witnessGroup.add(armG);
    three.witnessArms.push(armG);

    var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10), witnessSkinMat);
    upper.position.set(side * 0.12, -0.08, 0);
    upper.rotation.z = dir * 0.55;
    armG.add(upper);

    var lower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.55, 10), witnessSkinMat);
    lower.position.set(side * 0.4, 0.18, 0);
    lower.rotation.z = dir * 0.35;
    armG.add(lower);
  });

  // ── SCALES OF JUSTICE (CENTER BACKGROUND) ──────────────────────
  var scalesG = new THREE.Group();
  scalesG.position.set(0, 0.5, -0.5);
  s.add(scalesG);

  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.4, 12), goldMat);
  scalesG.add(pole);

  three.scalesBeam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.035), goldMat);
  three.scalesBeam.position.y = 0.6;
  scalesG.add(three.scalesBeam);

  [-0.5, 0.5].forEach(function(x) {
    var chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), goldMat);
    chain.position.set(x, 0.45, 0);
    scalesG.add(chain);
    var pan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), goldMat);
    pan.position.set(x, 0.28, 0);
    scalesG.add(pan);
  });

  // Yawn emoji sprite
  var spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 256; spriteCanvas.height = 256;
  var sCtx = spriteCanvas.getContext('2d');
  sCtx.font = '200px sans-serif';
  sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
  sCtx.fillText('🥱', 128, 140);
  var spriteTex = new THREE.CanvasTexture(spriteCanvas);
  three.yawnSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, transparent: true, opacity: 0 }));
  three.yawnSprite.scale.set(1.4, 1.4, 1);
  three.yawnSprite.position.set(1.1, 2.2, 0);
  s.add(three.yawnSprite);
}

function animateScene(t) {
  if (!three.scene) return;

  if (!animState.isStriking) {
    // Idle animations
    if (three.judgeHead) {
      three.judgeHead.position.y = 0.72 + Math.sin(t * 1.2) * 0.018;
      three.judgeHead.rotation.y = Math.sin(t * 0.5) * 0.07;
    }
    if (three.gavelGroup) {
      three.gavelGroup.rotation.z = 0.35 + Math.sin(t * 0.7) * 0.04;
    }

    // Continuous witness yawn cycle (ambient)
    var cycle = (t % 5.5) / 5.5;
    var yawnAmt = 0;
    if (cycle < 0.2)      yawnAmt = cycle / 0.2;
    else if (cycle < 0.55) yawnAmt = 1.0;
    else if (cycle < 0.8)  yawnAmt = 1.0 - (cycle - 0.55) / 0.25;
    yawnAmt = Math.max(0, Math.min(1, yawnAmt));

    if (three.witnessHead) {
      three.witnessHead.rotation.x = -yawnAmt * 0.35;
      three.witnessHead.position.y = 0.6 + yawnAmt * 0.04;
    }
    if (three.witnessJaw) three.witnessJaw.rotation.x = yawnAmt * 0.5;
    if (three.witnessMouthHole) three.witnessMouthHole.scale.set(1 + yawnAmt * 1.1, 1 + yawnAmt * 0.7, 1);
    three.witnessEyes && three.witnessEyes.forEach(function(eg) {
      var lid = eg.userData.lid;
      if (lid) lid.scale.y = 1 + yawnAmt * 3.2;
    });
    if (three.witnessArms) {
      three.witnessArms[0].rotation.z = yawnAmt * -1.0;
      three.witnessArms[1].rotation.z = yawnAmt * 1.0;
      three.witnessArms.forEach(function(a) { a.position.y = -0.2 + yawnAmt * 0.2; });
    }

    if (three.scalesBeam) three.scalesBeam.rotation.z = Math.sin(t * 0.4) * 0.08;
    if (three.yawnSprite) three.yawnSprite.material.opacity = 0;

  } else {
    // Triggered yawn event animation
    animState.progress += 0.12;
    var p = animState.progress;
    var ang = Math.sin(Math.min(p, Math.PI));

    if (three.gavelGroup) three.gavelGroup.rotation.z = 0.35 - ang * 1.4;
    if (three.judgeHead)  three.judgeHead.rotation.x  = -ang * 0.22;

    if (three.witnessJaw)         three.witnessJaw.rotation.x = ang * 0.55;
    if (three.witnessHead)        three.witnessHead.rotation.x = -ang * 0.4;
    if (three.witnessMouthHole)   three.witnessMouthHole.scale.set(1 + ang * 1.3, 1 + ang * 0.8, 1);
    three.witnessEyes && three.witnessEyes.forEach(function(eg) {
      var lid = eg.userData.lid;
      if (lid) lid.scale.y = 1 + ang * 4;
    });
    if (three.witnessArms) {
      three.witnessArms[0].rotation.z = -ang * 1.2;
      three.witnessArms[1].rotation.z = ang * 1.2;
      three.witnessArms.forEach(function(a) { a.position.y = -0.2 + ang * 0.25; });
    }
    if (three.scalesBeam) three.scalesBeam.rotation.z = ang * 0.25;
    if (three.yawnSprite) {
      three.yawnSprite.material.opacity = ang;
      three.yawnSprite.position.y = 2.0 + ang * 0.8;
    }

    if (p >= Math.PI) {
      animState.isStriking = false;
      animState.progress = 0;
      if (three.gavelGroup) three.gavelGroup.rotation.z = 0.35;
      if (three.judgeHead)  three.judgeHead.rotation.x = 0;
    }
  }
}

function triggerYawnAnimation() {
  animState.isStriking = true;
  animState.progress   = 0;
}

// ═══════════════════════════════════════════════════════════════════
//  PROPER MAR COMPUTATION
//  Uses the standard dlib-style Mouth Aspect Ratio formula:
//  MAR = (sum of 2 vertical mouth distances) / (2 × horizontal width)
//  This is normalized by mouth width, making it face-size independent.
// ═══════════════════════════════════════════════════════════════════
function computeMAR(lm) {
  // Only need indices up to 317 — relax the length check
  if (!lm || lm.length < 100) return 0;

  // Check that the specific landmarks we use actually exist
  var p13 = lm[13], p14 = lm[14];
  var p61 = lm[61], p291 = lm[291];
  var p82 = lm[82], p87 = lm[87];
  var p312 = lm[312], p317 = lm[317];
  if (!p13 || !p14 || !p61 || !p291) return 0;

  // MediaPipe mouth landmark indices:
  // Upper inner lip:  lm[13]  Lower inner lip: lm[14]
  // Left corner:      lm[61]  Right corner:    lm[291]
  // Upper inner L:    lm[82]  Lower inner L:   lm[87]
  // Upper inner R:    lm[312] Lower inner R:   lm[317]

  // Two vertical measurements (inner lip pairs)
  var v1 = dist2D(p13, p14);                                   // center vertical
  var v2 = (p82 && p87)   ? dist2D(p82, p87)   : v1;         // left inner (fallback to center)
  var v3 = (p312 && p317) ? dist2D(p312, p317) : v1;         // right inner (fallback to center)

  // Horizontal: mouth corner distance
  var h = dist2D(p61, p291);
  if (h < 0.003) return 0;

  // Standard MAR formula: weighted vertical / horizontal
  return (v1 * 2 + v2 + v3) / (4.0 * h);
}

function dist2D(a, b) {
  if (!a || !b) return 0;
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ═══════════════════════════════════════════════════════════════════
//  CANVAS OVERLAY — draws mouth landmarks + MAR + FSM status
// ═══════════════════════════════════════════════════════════════════
function drawOverlay(lm, marVal) {
  var canvas = els.canvasOverlay || document.getElementById('canvasOverlay');
  var ctx    = els.ctx;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;

  var w = canvas.width, h = canvas.height;
  var fsm = yawnFSM.state;

  var strokeColor = '#d4af37';      // IDLE: gold
  var fillColor   = 'transparent';
  if (fsm === 'POSSIBLE')  {
    if (yawnFSM.yawnThrEnteredAt > 0) {
      strokeColor = '#ef4444'; fillColor = 'rgba(255,30,30,0.25)'; // red = yawn accumulating
    } else {
      strokeColor = '#f59e0b'; // amber = mouth opening
    }
  }

  // Mouth outline
  var mouthIdx = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,13,14,87,317,82,312];
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = (fsm === 'POSSIBLE' && yawnFSM.yawnThrEnteredAt > 0) ? 4 : 2;
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  mouthIdx.forEach(function(idx, i) {
    var pt = lm[idx];
    if (!pt) return;
    if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
    else         ctx.lineTo(pt.x * w, pt.y * h);
  });
  ctx.closePath();
  ctx.stroke();
  if (fillColor !== 'transparent') {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  // Landmark dots
  mouthIdx.forEach(function(idx) {
    var pt = lm[idx];
    if (!pt) return;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.shadowBlur = 0;
    ctx.fill();
  });

  // MAR readout text near mouth
  var centerLip = lm[13];
  if (centerLip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = strokeColor;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    var label = 'jaw:' + marVal.toFixed(3);
    if (fsm === 'POSSIBLE' && yawnFSM.yawnThrEnteredAt > 0) label = '🥱 ' + label;
    else if (fsm === 'POSSIBLE') label = '👀 ' + label;
    ctx.fillText(label, -(centerLip.x * w) - 60, (centerLip.y * h) - 18);
    ctx.restore();
  }

  // Debug overlay (only when CONFIG.DEBUG = true)
  if (CONFIG.DEBUG) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0,255,0,0.9)';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    var lines = [
      'FSM: ' + yawnFSM.state,
      'jawOpen: ' + yawnFSM.smoothMAR.toFixed(3),
      'thr: ' + CONFIG.JAW_OPEN_THRESHOLD,
      'frames: ' + (yawnFSM.yawnThrEnteredAt ? (now - yawnFSM.yawnThrEnteredAt) + 'ms' : '0ms') + '/' + CONFIG.CONFIRM_YAWN_MS,
      'calibrated: ' + yawnFSM.calibrated,
      'cooldown: ' + yawnFSM.cooldown,
      'face: ' + yawnFSM.faceVisible,
    ];
    lines.forEach(function(line, i) {
      ctx.fillText(line, -(w - 10), 16 + i * 16);
    });
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  FSM STEP — called every frame with the current smoothed MAR
// ═══════════════════════════════════════════════════════════════════
// ── FSM using jawOpen blendshape score ───────────────────────────
// smoothMAR here is actually the smoothed jawOpen blendshape score (0.0–1.0)
// No calibration or baseline math needed.
function stepFSM(jawScore, now) {
  if (yawnFSM.cooldown) return;

  var possibleThr = CONFIG.JAW_OPEN_POSSIBLE;    // e.g. 0.25
  var yawnThr     = CONFIG.JAW_OPEN_THRESHOLD;   // e.g. 0.45
  var fsm         = yawnFSM.state;

  if (fsm === 'IDLE') {
    if (jawScore >= possibleThr) {
      yawnFSM.state = 'POSSIBLE';
      yawnFSM.stateEnteredAt = now;
      yawnFSM.yawnThrEnteredAt = 0;
      showSuspiciousStatus();
      console.log('Possible yawn, jawOpen=' + jawScore.toFixed(3));
    }

  } else if (fsm === 'POSSIBLE') {
    if (jawScore < possibleThr) {
      // Dropped back below possible — talking/smiling, not a yawn
      yawnFSM.state = 'IDLE';
      yawnFSM.yawnThrEnteredAt = 0;
      clearSuspiciousStatus();
    } else if (jawScore >= yawnThr) {
      // Track time above yawnThr
      if (!yawnFSM.yawnThrEnteredAt) {
        yawnFSM.yawnThrEnteredAt = now;
      }
      var elapsedYawn = now - yawnFSM.yawnThrEnteredAt;

      var statusEl = document.getElementById('scannerStatusText');
      if (statusEl) {
        var pct = Math.min(100, Math.round((elapsedYawn / CONFIG.CONFIRM_YAWN_MS) * 100));
        statusEl.textContent = '⚠️ CONFIRMING... ' + pct + '%';
        statusEl.style.color = '#ef4444';
      }

      if (elapsedYawn >= CONFIG.CONFIRM_YAWN_MS) {
        // ✅ CONFIRMED: jawOpen stayed above threshold for enough time
        yawnFSM.state = 'IDLE';
        yawnFSM.yawnThrEnteredAt = 0;
        clearSuspiciousStatus();

        if (statusEl) {
            statusEl.textContent = '🚨 YAWN DETECTED 💀';
            statusEl.style.color = '#ef4444';
        }

        console.log('🚨 YAWN CONFIRMED! jawOpen=' + jawScore.toFixed(3) +
                    ' (held for ' + CONFIG.CONFIRM_YAWN_MS + ' ms)');

        yawnFSM.cooldown = true;
        
        // Direct call to handler (photo will be taken inside handler)
        handleYawnDetected();
        
        setTimeout(function() { 
          yawnFSM.cooldown = false; 
          clearSuspiciousStatus(); 
        }, CONFIG.COOLDOWN_MS);
      }
    } else {
      // Between possibleThr and yawnThr — reset timer, keep showing warning
      yawnFSM.yawnThrEnteredAt = 0;
      var statusEl2 = document.getElementById('scannerStatusText');
      if (statusEl2) {
        statusEl2.textContent = '👀 WARNING: MOUTH OPENING...';
        statusEl2.style.color = '#f59e0b';
      }
    }
  } else {
    // Failsafe
    yawnFSM.state = 'IDLE';
    yawnFSM.yawnThrEnteredAt = 0;
  }
}

function showSuspiciousStatus() {
  var statusEl = document.getElementById('scannerStatusText');
  if (statusEl) {
    statusEl.textContent = '👀 WARNING: MOUTH OPENING...';
    statusEl.style.color = '#f59e0b';
  }
}

function clearSuspiciousStatus() {
  var statusEl = document.getElementById('scannerStatusText');
  if (statusEl) {
    statusEl.textContent = 'LIVE MONITORING ACTIVE ✅';
    statusEl.style.color = '';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN DETECTION LOOP — runs on every webcam frame
// ═══════════════════════════════════════════════════════════════════
function detectionLoop() {
  requestAnimationFrame(detectionLoop);

  if (!state.running) return;

  var video = document.getElementById('webcam');
  if (!video || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  var canvas = document.getElementById('canvasOverlay');
  if (!canvas) return;
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  els.canvasOverlay = canvas;
  els.ctx = canvas.getContext('2d');

  var now      = Date.now();
  var jawOpen  = 0;   // MediaPipe blendshape score 0.0–1.0
  var lm       = null;

  // ── ENGINE: MediaPipe Face Landmarks + Blendshapes ───────────────
  if (faceLandmarker) {
    try {
      var results    = faceLandmarker.detectForVideo(video, performance.now());
      var landmarks  = results.faceLandmarks;
      var blendshapes = results.faceBlendshapes;

      if (landmarks && landmarks.length > 0) {
        lm = landmarks[0];

        // Extract jawOpen blendshape score — far more robust than manual MAR
        if (blendshapes && blendshapes.length > 0) {
          var categories = blendshapes[0].categories;
          for (var bi = 0; bi < categories.length; bi++) {
            if (categories[bi].categoryName === 'jawOpen') {
              jawOpen = categories[bi].score;
              break;
            }
          }
        }

        if (!yawnFSM.faceVisible) console.log('Face detected, jawOpen=' + jawOpen.toFixed(3));
        yawnFSM.faceVisible  = true;
        yawnFSM.noFaceFrames = 0;
      } else {
        yawnFSM.noFaceFrames++;
        if (yawnFSM.noFaceFrames > 15) {
          yawnFSM.faceVisible = false;
          var st = document.getElementById('scannerStatusText');
          if (st) { st.textContent = '👤 Please face the camera'; st.style.color = '#f59e0b'; }
        }
      }
    } catch (e) {
      console.warn('MediaPipe frame error:', e.message);
    }
  }

  // ── ROLLING AVERAGE SMOOTHING (over blendshape scores) ───────────
  yawnFSM.marHistory.push(jawOpen);
  if (yawnFSM.marHistory.length > CONFIG.SMOOTH_FRAMES) {
    yawnFSM.marHistory.shift();
  }
  var bsSum = 0;
  for (var bk = 0; bk < yawnFSM.marHistory.length; bk++) bsSum += yawnFSM.marHistory[bk];
  yawnFSM.smoothMAR = bsSum / yawnFSM.marHistory.length;

  // MediaPipe is already loaded (we awaited it in startCourtroomScanner).
  // No calibration needed — just mark ready on first successful frame.
  if (!yawnFSM.calibrated && faceLandmarker) {
    yawnFSM.calibrated = true;
    var stCal = document.getElementById('scannerStatusText');
    if (stCal) { stCal.textContent = 'LIVE MONITORING ACTIVE ✅'; stCal.style.color = ''; }
    console.log('✅ Detection active. Open your mouth wide to test.');
  }

  // ── DRAW OVERLAY ─────────────────────────────────────────────────
  drawOverlay(lm, yawnFSM.smoothMAR);

  // ── UPDATE MAR READOUT ───────────────────────────────────────────
  if (CONFIG.DEBUG && yawnFSM.faceVisible) {
    console.log('jawOpen = ' + yawnFSM.smoothMAR.toFixed(3));
  }
  updateMARReadout();

  // ── STEP THE FSM ─────────────────────────────────────────────────
  if (yawnFSM.calibrated && yawnFSM.faceVisible) {
    stepFSM(yawnFSM.smoothMAR, now);
  }
}

function updateMARReadout() {
  var marEl = document.getElementById('marReadout');
  if (!marEl) return;
  var fsm = yawnFSM.state;
  var score = yawnFSM.smoothMAR;
  var label = 'jaw:' + score.toFixed(3);
  if (!yawnFSM.calibrated) { label = 'Starting...'; marEl.style.color = '#60a5fa'; }
  else if (fsm === 'POSSIBLE' && yawnFSM.yawnThrEnteredAt > 0) {
    var now = Date.now();
    var pct = Math.round(((now - yawnFSM.yawnThrEnteredAt) / CONFIG.CONFIRM_YAWN_MS) * 100);
    label += ' 🥱 YAWN! ' + pct + '%'; marEl.style.color = '#ef4444';
  }
  else if (fsm === 'POSSIBLE') { label += ' 👀 Mouth open'; marEl.style.color = '#f59e0b'; }
  else { label += ' (' + score.toFixed(2) + ')'; marEl.style.color = '#d4af37'; }
  marEl.textContent = label;
}

// ── MEDIAPIPE INIT — 4-tier fallback ─────────────────────────────
async function initMediaPipe() {
  // Tier 1: Direct globals from vision_bundle.js (most common)
  var FR = window.FilesetResolver;
  var FL = window.FaceLandmarker;

  // Tier 2: Namespace objects some bundle versions use
  if (!FR || !FL) {
    var ns = window.tasksVision || window.vision || window.mediapipe;
    if (ns) { FR = ns.FilesetResolver; FL = ns.FaceLandmarker; }
  }

  // Tier 3: Force reload the CDN script and try again
  if (!FR || !FL) {
    console.warn('MediaPipe globals not found; reloading CDN script...');
    await new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[src*="vision_bundle"]');
      if (existing) existing.remove();
      var s = document.createElement('script');
      s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js';
      s.onload = resolve;
      s.onerror = function() { reject(new Error('CDN load failed')); };
      document.head.appendChild(s);
    });
    FR = window.FilesetResolver
      || (window.tasksVision && window.tasksVision.FilesetResolver)
      || (window.vision && window.vision.FilesetResolver);
    FL = window.FaceLandmarker
      || (window.tasksVision && window.tasksVision.FaceLandmarker)
      || (window.vision && window.vision.FaceLandmarker);
  }

  // Tier 4: Try ES module dynamic import
  if (!FR || !FL) {
    try {
      var mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      FR = mod.FilesetResolver;
      FL = mod.FaceLandmarker;
    } catch(e) { console.warn('ES module import also failed:', e.message); }
  }

  if (!FR || !FL) {
    throw new Error(
      'MediaPipe failed to load. Check your internet connection and try refreshing. ' +
      'You can still use the SIMULATE YAWN button to test the app.'
    );
  }

  var wasmBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  var modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  var visionWasm = await FR.forVisionTasks(wasmBase);

  try {
    faceLandmarker = await FL.createFromOptions(visionWasm, {
      baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
      outputFaceBlendshapes: true,   // ← enables jawOpen and other blendshapes
      runningMode: 'VIDEO',
      numFaces: 1
    });
  } catch (gpuErr) {
    console.warn('GPU delegate failed, falling back to CPU for MediaPipe:', gpuErr);
    faceLandmarker = await FL.createFromOptions(visionWasm, {
      baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
      outputFaceBlendshapes: true,   // ← enables jawOpen and other blendshapes
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }

  console.log('✅ MediaPipe FaceLandmarker loaded successfully');
}

// ── START SCANNER ─────────────────────────────────────────────────
window.startCourtroomScanner = async function() {
  grabDOMRefs();
  var statusText = document.getElementById('scannerStatusText');

  if (statusText) statusText.textContent = 'REQUESTING CAMERA...';

  try {
    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
    } catch (e1) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    var video = document.getElementById('webcam');
    if (video) {
      video.srcObject = stream;
      if (video.readyState < 1) {
        await new Promise(function(res) {
          video.onloadedmetadata = res;
          setTimeout(res, 300);
        });
      }
      try { await video.play(); } catch (_) {}
    }

    if (statusText) statusText.textContent = '📷 Camera ready. Loading AI model...';

    state.running = true;
    lastVideoTime = -1;

    // ── STEP 1: Load MediaPipe FIRST, then start the loop ────────────
    // Camera and MediaPipe load in parallel (camera already started above).
    // But detectionLoop must NOT start until faceLandmarker is ready,
    // otherwise jawOpen stays 0 forever and yawns are never detected.
    if (!faceLandmarker) {
      try {
        await initMediaPipe();
        console.log('✅ AI model ready. Starting detection loop.');
      } catch (e) {
        console.warn('AI load failed, detection unavailable:', e);
        if (statusText) statusText.textContent = '⚠️ AI model failed. Use Simulate button.';
      }
    }

    // ── STEP 2: NOW start the detection loop — faceLandmarker is ready ─
    detectionLoop();

  } catch (err) {
    console.error('Camera startup notice:', err);
    if (statusText) statusText.textContent = 'CAMERA NOTICE: Check Permissions';
  }
};

// ── YAWN HANDLER ──────────────────────────────────────────────────
function captureCameraPhoto() {
  var video = document.getElementById('webcam');
  if (!video || video.readyState < 2) return null;
  
  var tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth || 640;
  tempCanvas.height = video.videoHeight || 480;
  var tempCtx = tempCanvas.getContext('2d');
  
  // Flip horizontally to match the webcam view
  tempCtx.translate(tempCanvas.width, 0);
  tempCtx.scale(-1, 1);
  try {
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    return tempCanvas.toDataURL('image/jpeg', 0.85);
  } catch(e) {
    console.error("Canvas draw error:", e);
    return null;
  }
}

function handleYawnDetected() {
  state.yawnCount++;

  var now = Date.now();
  if (state.lastYawnTime && (now - state.lastYawnTime) < CONFIG.STREAK_WINDOW_MS) {
    state.streak++;
  } else {
    state.streak = 1;
  }
  state.lastYawnTime = now;

  // Take a single photo EXACTLY when the yawn is confirmed
  var photoUrl = captureCameraPhoto();

  updateStats();
  addEvidenceCard(state.yawnCount, photoUrl);
  playGavelStrike();
  triggerYawnAnimation();
  triggerObjectionBanner(photoUrl);
}

function triggerObjectionBanner(photoUrl) {
  var overlay = els.objectionOverlay || document.getElementById('objectionOverlay');
  var quote   = JUDGE_REACTIONS[Math.floor(Math.random() * JUDGE_REACTIONS.length)];

  var photoFrame = document.querySelector('.objection-photo-frame');
  var photoImg = document.getElementById('objectionPhoto');
  
  if (photoUrl && photoFrame && photoImg) {
    photoImg.src = photoUrl;
    photoFrame.classList.remove('has-photo');
    void photoFrame.offsetWidth; // trigger reflow for animation restart
    photoFrame.classList.add('has-photo');
  } else if (photoFrame) {
    photoFrame.classList.remove('has-photo');
  }

  var qEl = els.objectionQuote || document.getElementById('objectionQuote');
  if (qEl) qEl.textContent = '"' + quote + '"';

  var ticker = els.tickerText || document.getElementById('tickerText');
  if (ticker) ticker.textContent = '"' + quote + '"';

  if (overlay) {
    overlay.classList.remove('pop-active');
    void overlay.offsetWidth;
    overlay.classList.add('pop-active');
  }

  var tickerBox = els.reactionTicker || document.getElementById('reactionTicker');
  if (tickerBox) {
    tickerBox.classList.add('active-reaction');
    setTimeout(function() { tickerBox.classList.remove('active-reaction'); }, 4000);
  }

  var jBadge = els.judgeStatusBadge || document.getElementById('judgeStatusBadge');
  var vBadge = els.judgeVerdictBadge || document.getElementById('judgeVerdictBadge');
  if (jBadge) jBadge.textContent = quote + ' 🔨';
  if (vBadge) vBadge.textContent = quote + ' 🔨';

  speakJudgeQuote(quote);
}

// ── STATS UPDATE ──────────────────────────────────────────────────
function getStatusText(n) {
  if (n === 0) return 'CASE OPENED 👀';
  if (n <= 2)  return 'SUSPICIOUS 🥱';
  if (n <= 5)  return 'STRONG EVIDENCE 😭';
  if (n <= 9)  return 'EXTREMELY GUILTY 💀';
  return 'THE COURT HAS HAD ENOUGH ⚖️';
}

function updateStats() {
  var n = state.yawnCount;

  // Update all counter elements across all tabs and headers
  ['counterNum', 'courtYawnCount', 'headerYawnCount'].forEach(function(id) {
    var el = document.getElementById(id) || els[id];
    if (el) {
      el.textContent = n;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  });

  var status = getStatusText(n);
  var sBadge = els.statusBadge || document.getElementById('statusBadge');
  if (sBadge) sBadge.textContent = status;

  var stEl = els.streakNum || document.getElementById('streakNum');
  if (stEl) stEl.textContent = state.streak;

  var score = Math.min(100, Math.round(n * 5 + state.streak * 2));
  var scEl = els.scoreNum || document.getElementById('scoreNum');
  if (scEl) scEl.innerHTML = score + '<span style="font-size:1rem;color:var(--text-muted)">/100</span>';

  var pct = Math.min(100, Math.round((n / 18) * 100));
  var mEl = els.meterBarInner || document.getElementById('meterBarInner');
  if (mEl) mEl.style.width = pct + '%';
  var mPct = els.meterPctText || document.getElementById('meterPctText');
  if (mPct) mPct.textContent = pct + '%';

  if (n >= 10) {
    var vb = els.verdictBanner || document.getElementById('verdictBanner');
    if (vb) vb.classList.add('visible');
  }

  updateSessionTime();
  checkAchievements();
  renderLeaderboard();
}

function checkAchievements() {
  ACHIEVEMENTS.forEach(function(a) {
    if (!unlockedAchievements.has(a.id) && a.trigger(state)) {
      unlockedAchievements.add(a.id);
      var card = document.getElementById('ach-' + a.id);
      if (card) card.classList.add('unlocked');
    }
  });
}

function addEvidenceCard(count, photoUrl) {
  var grid = els.evidenceGrid || document.getElementById('evidenceGrid');
  if (!grid) return;

  // Remove placeholder
  var placeholder = grid.querySelector('.evidence-card');
  if (placeholder && placeholder.querySelector('.evidence-card-num') &&
      placeholder.querySelector('.evidence-card-num').textContent.includes('#00')) {
    placeholder.remove();
  }

  var desc = EVIDENCE_DESCRIPTIONS[Math.floor(Math.random() * EVIDENCE_DESCRIPTIONS.length)];
  var card = document.createElement('div');
  card.className = 'evidence-card';
  
  var html = '<div class="evidence-card-num">📁 EVIDENCE #' + String(count).padStart(2, '0') + '</div>';
  html += '<div class="evidence-card-title">🥱 Unauthorized Yawning</div>';
  if (photoUrl) {
    html += '<img class="evidence-card-photo" src="' + photoUrl + '" alt="Evidence snapshot" />';
  }
  html += '<div class="evidence-card-desc">"' + desc + '"</div>';
  
  card.innerHTML = html;
  grid.prepend(card);

  var countEl = els.evidenceCount || document.getElementById('evidenceCount');
  if (countEl) countEl.textContent = count + (count === 1 ? ' item' : ' items');
}

// ── WINDOW FUNCTIONS ──────────────────────────────────────────────
window.simulateManualYawn = function() {
  var ss = document.getElementById('startScreen');
  var es = document.getElementById('errorScreen');
  if (ss) ss.classList.add('hidden');
  if (es) es.classList.remove('visible');
  handleYawnDetected();
};

window.resetCourtSession = function() {
  state.yawnCount = 0;
  state.streak = 0;
  state.lastYawnTime = 0;
  state.sessionStart = Date.now();
  state.isYawning = false;
  state.cooldown = false;
  unlockedAchievements.clear();

  // Also reset the yawn FSM so detection starts fresh
  yawnFSM.state = 'IDLE';
  yawnFSM.stateEnteredAt = 0;
  yawnFSM.cooldown = false;
  yawnFSM.calibrated = false;
  yawnFSM.calibStartTime = 0;
  yawnFSM.calibFrames = [];
  yawnFSM.marHistory = [];
  yawnFSM.smoothMAR = 0;

  document.querySelectorAll('.achieve-card').forEach(function(c) { c.classList.remove('unlocked'); });

  var ids = { counterNum:'0', streakNum:'0', meterPctText:'0%', sessionTimeNum:'0m 0s', yawnRateNum:'0.0' };
  Object.keys(ids).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = ids[id];
  });

  var scEl = document.getElementById('scoreNum');
  if (scEl) scEl.innerHTML = '0<span style="font-size:1rem;color:var(--text-muted)">/100</span>';

  var mb = document.getElementById('meterBarInner');
  if (mb) mb.style.width = '0%';

  var vb = document.getElementById('verdictBanner');
  if (vb) vb.classList.remove('visible');

  var eg = document.getElementById('evidenceGrid');
  if (eg) eg.innerHTML = '<div class="evidence-card"><div class="evidence-card-num">📁 EVIDENCE #00</div><div class="evidence-card-title">👀 Waiting for Evidence</div><div class="evidence-card-desc">"No yawns recorded yet..."</div></div>';

  var ec = document.getElementById('evidenceCount');
  if (ec) ec.textContent = '0 items';

  var tt = document.getElementById('tickerText');
  if (tt) tt.textContent = 'Court is in session. Waiting for evidence... 👀';

  var sb = document.getElementById('statusBadge');
  if (sb) sb.textContent = 'CASE OPENED 👀';

  renderLeaderboard();
};

window.openCaseReport = function() {
  grabDOMRefs();
  var elapsed = Math.round((Date.now() - state.sessionStart) / 1000);
  var m = Math.floor(elapsed / 60), s2 = elapsed % 60;
  var rate = elapsed > 10 ? (state.yawnCount / (elapsed / 60)).toFixed(1) : '0.0';

  var rows = [
    ['Case Identifier', '#CTRL-YAWN-' + Math.floor(100 + Math.random() * 900)],
    ['Defendant', 'You (Defendant)'],
    ['Evidence Pieces', state.yawnCount + ' Yawns'],
    ['Best Yawn Streak', state.streak + ' 🔥'],
    ['Sleepiness Score', Math.min(100, Math.round(state.yawnCount * 5)) + '/100'],
    ['Trial Duration', m + 'm ' + s2 + 's (' + rate + ' yawns/min)'],
    ['Case Status', getStatusText(state.yawnCount)],
    ['Achievements', unlockedAchievements.size + '/' + ACHIEVEMENTS.length],
  ];

  if (els.reportRows) {
    els.reportRows.innerHTML = rows.map(function(r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('');
  }

  if (els.reportVerdictBox) {
    els.reportVerdictBox.innerHTML = '<strong>VERDICT: GUILTY OF BEING SLEEPY 💀</strong><br>SENTENCE: GO TO BED IMMEDIATELY 🛏️<br><br><em>"Congratulations. You have wasted time measuring yawns."</em>';
  }

  if (els.modalBackdrop) els.modalBackdrop.classList.add('open');
};

window.closeCaseReport = function() {
  if (els.modalBackdrop) els.modalBackdrop.classList.remove('open');
  var mb = document.getElementById('modalBackdrop');
  if (mb) mb.classList.remove('open');
};

window.submitToBackend = function() {
  renderLeaderboard();
  window.switchTab('leaderboard');
  alert('⚖️ CASE SUBMITTED!\nYour score of ' + state.yawnCount + ' yawns has been recorded in the High Court database!');
};

window.toggleSound = function() {
  state.soundEnabled = !state.soundEnabled;
  var btn = els.soundToggleBtn || document.getElementById('soundToggleBtn');
  if (btn) btn.textContent = state.soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF';
};

// ── INIT ON LOAD ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  // Show intro, init 3D intro
  setTimeout(initIntro3D, 100);
  spawnParticles();
  // Pre-load MediaPipe AI in background so it's instant!
  initMediaPipe().catch(function(e) { console.warn('AI background pre-load notice:', e); });
  // Pre-load speech voices
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function() { window.speechSynthesis.getVoices(); };
    window.speechSynthesis.getVoices();
  }
});
