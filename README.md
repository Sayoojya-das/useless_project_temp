# 🥱 Ctrl+Yawn 💀 — The Yawn Court

> **“Every yawn is evidence. Every user is on trial. The final verdict: GUILTY OF BEING SLEEPY. 💀”**

[![TinkerHub](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)](https://www.tinkerhub.org/)
[![Useless Projects](https://img.shields.io/badge/UselessProjects--3.0-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)](https://tinkerhub.org/events/1M8ORET9A1/useless-projects-3.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## 🎯 Basic Details

### Team Name: Ecoconnect⚖️

### Team Members
- **Team Lead:** Sayoojya Das Ak — LBS INSTITUTE OF TECHNOLOGY FOR WOMEN
- **Member 2:** Ashika k-LBS INSTITUTE OF TECHNOLOGY FOR WOMEN
- 

---

## 🏛️ Project Description

**Ctrl+Yawn — The Yawn Court** is an absurd, courtroom-themed computer vision web application that turns your webcam into an AI-powered legal evidence scanner. Using **MediaPipe FaceLandmarker blendshapes**, **Three.js 3D animations**, and **Web Audio / Speech synthesis**, the app detects real-time yawns, captures snapshot photo evidence on the spot, triggers dramatic 3D gavel strikes, and convicts defendants on the global **High Court Leaderboard**.

---

## 🛑 The Problem (that doesn't exist)
People yawn throughout the day—during lectures, endless meetings, or late-night coding sessions—without being held accountable or officially sentenced for their sleepiness. Currently, there is **zero legal oversight** for unauthorized yawning.

---

## ⚖️ The Solution (that nobody asked for)
We built **The Yawn Court**!
1. **AI Face Blendshape Yawn Detection**: Tracks facial landmarks and uses MediaPipe's `jawOpen` blendshape to analyze mouth openness in real time.
2. **250ms Time-Based Confirmation Gate**: Requires the mouth to remain widely open for 250ms continuously, eliminating false alarms from talking or smiling.
3. **Automatic Evidence Snapshot**: Takes an instant JPEG snapshot from your live webcam at the exact moment a yawn is confirmed, stamping it with a polaroid-style **GUILTY** ink mark.
4. **Dual 3D Canvas Engine (Three.js)**:
   - **3D Intro Yawning Human**: An interactive 3D character stretching and yawning on the splash screen.
   - **3D Courtroom Scene**: A 3D Judge who slams a wooden gavel, a 3D Witness character who yawns in sync, and 3D Scales of Justice.
5. **Web Audio & Voice Synthesis**: Synthesizes procedural wooden gavel thuds and uses deep Text-to-Speech voices to read out judicial objections (*"OBJECTION! THAT WAS CLEARLY A YAWN! 🚨"*).
6. **High Court Evidence Locker & Leaderboard**: Stores defendant scores locally and ranks you against other sleepy offenders on the High Court Leaderboard.
7. **Final Verdict**: Reaching 10+ yawns triggers a dramatic verdict: **🔨 GUILTY OF BEING SLEEPY. Sentence: GO TO BED IMMEDIATELY 🛏️**.

---

## 🛠️ Key Technical Modifications & Architecture

### 1. Robust Blendshape Detection Engine
- **MediaPipe Tasks Vision**: Uses `@mediapipe/tasks-vision@0.10.14` FaceLandmarker with `outputFaceBlendshapes: true`.
- **jawOpen Metric**: Operates on a scale of `0.0` (closed) to `1.0` (fully open), making detection face-size, camera distance, and angle independent.
- **4-Tier Loading Fallback**: Supports global scope script loading, namespace objects, dynamic script injection, and ES module import, with CPU fallback if WebGL GPU delegate fails.

### 2. Time-Based Finite State Machine (FSM)
- `IDLE` → `POSSIBLE` (when `jawOpen >= 0.45`) → `CONFIRMING` (timer gate `250ms`) → `YAWN CONFIRMED` → `COOLDOWN` (`3500ms`).
- Prevents continuous rapid firing while ensuring rapid detection of genuine yawns.

### 3. Automatic Snapshot & Evidence Generation
- `captureCameraPhoto()` draws the mirrored video stream to an offscreen canvas.
- Renders the snapshot into the **🚨 YAWN DETECTED 💀** Court Objection Overlay and prepends a new card to the **📁 Evidence Locker**.

### 4. 5-Tab User Interface
- ⚖️ **Courtroom**: Live webcam feed, 3D Courtroom, objection banner, and scanner controls.
- 📊 **Stats**: Yawn count, streak counter, sleepiness score, and fake sleepiness meter.
- 📁 **Evidence**: Digital evidence cards with real captured webcam photos and timestamps.
- 🏆 **Leaderboard**: High Court rankings synced via `localStorage`.
- 🎖️ **Achievements**: 6 unlockable badges (*FIRST OFFENCE*, *REPEAT OFFENDER*, *NO REGRETS*, *PROFESSIONAL SLEEPER*, *COURT'S WORST CLIENT*, *FINAL BOSS OF SLEEP*).

---

## 💻 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend UI** | HTML5, Vanilla CSS3 (Absurd Courtroom Theme with Mahogany Wood, Gold Accents & Cream Paper Textures), JavaScript ES6+ |
| **Computer Vision** | `@mediapipe/tasks-vision` (FaceLandmarker & `jawOpen` Face Blendshapes) |
| **3D Graphics Engine** | Three.js (3D Judge, Gavel, 3D Witness, 3D Scales of Justice & 3D Intro Human) |
| **Audio Synthesis** | Web Audio API (Procedural Gavel Impact & Pitch-Drop Synths) |
| **Voice Engine** | Web Speech API (`speechSynthesis` deep voice judge quotes) |
| **Storage & Persistence** | `localStorage` for High Court Leaderboard and unlocked achievements |

---

## 📁 File Structure

```
useless_project_temp/
├── index.html        # Main HTML structure with 5-tab navigation & modals
├── style.css         # Absurd Courtroom theme styles, animations, polaroid frames
├── script.js        # Complete JS engine (MediaPipe, FSM, Three.js 3D, Web Audio/Speech)
└── README.md         # Project documentation & technical guide
```

---

## 🚀 How to Run

1. Clone or download this repository.
2. Open [`index.html`](file:///c:/Users/sayoo/Desktop/useless_project_temp/index.html) in any modern web browser (Google Chrome, Microsoft Edge, Safari, Brave).
3. Allow camera permissions when prompted.
4. Click **⚖️ ENTER THE COURTROOM**.
5. Yawn in front of the webcam to experience live 3D gavel slams, automatic photo evidence capture, and court sentencing!

---

## ❓ Frequently Asked Questions

**Q: What problem does this solve?**
> *“It solves the problem of not knowing how many times you have yawned.” 😭*

**Q: Is my camera data uploaded anywhere?**
> *“No! 100% of face tracking, landmark detection, and photo snapshots run locally inside your browser. No video or images are sent to any server.” 🔒*

**Q: What is the real-world application?**
> *“Currently, none.” 💀*

---

Made with ❤️ at **TinkerHub Useless Projects** 

![TinkerHub](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Useless Projects](https://img.shields.io/badge/UselessProjects--3.0-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
