<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# 🥱 Ctrl+Yawn 💀 — The Yawn Court


## Yawn Court is a fun and useless web-based project that uses the camera and facial landmark detection to detect when a person yawns
### Team Name: ECOCONNECT


### Team Members
- Team Lead: SAYOOJYA DAS AK - LBS INSTITUTE OF TECHNOLOGY FOR WOMEN
- Member 2: ASHIKA K- LBS INSTITUTE OF TECHNOLOGY FOR WOMEN


### Project Description
Yawn Court is a fun and useless web-based project that uses the camera and facial landmark detection to detect when a person yawns. When a yawn is detected, the system treats it like a courtroom case and humorously declares the person “Guilty of Yawning.” It keeps track of detected yawns and turns a simple facial movement into a funny courtroom experience. 😴⚖️

### The Problem (that doesn't exist)
People yawn throughout the day—during lectures, endless meetings, or late-night coding sessions—without being held accountable or officially sentenced for their sleepiness. Currently, there is **zero legal oversight** for unauthorized yawning.

### The Solution (that nobody asked for)
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

## Technical Details
###### 1. Robust Blendshape Detection Engine
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



### Implementation
For Software:
# Installation
npm install 

# Run
npm run dev

### Project Documentation
For Software:

# Screenshots (Add at least 3)
<img width="960" height="564" alt="coding Phase" src="https://github.com/user-attachments/assets/b5b17440-22cf-4fac-9214-18972e91ea9a" />

This screenshot shows the coding space..
<img width="960" height="564" alt="Deploying Phase" src="https://github.com/user-attachments/assets/84149484-54fe-4d71-a6de-930d98944c4c" />


At the deploying stage..

<img width="960" height="564" alt="Cover page" src="https://github.com/user-attachments/assets/9783dfa6-3b11-4000-aa75-21e1e45eeb3b" />

The final overview of the webapp

# Diagrams
![Workflow](Add your workflow/architecture diagram here)
*Add caption explaining your workflow*



### Project Demo
# Video
[Add your demo video link here]
*Explain what the video demonstrates*

# Additional Demos
https://useless-project-temp-bsy0.onrender.com

## Team Contributions
- SAYOOJYA DAS AK: IDEA PITCHING,IMPLEMENTATION
- ASHIKA K: IDEA PITCHING,IMPLEMENTATION


---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
