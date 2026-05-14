const dentaturaFrontale = new Image();
// use the required x-ray overlay image from the project's asset folder
dentaturaFrontale.src = "asset/dentatura-frontale.jpeg";

const otturazione = new Image();
// use the restoration image bundled with the project
otturazione.src = "asset/otturazione.jpeg";
 
const video = document.getElementById("webcam");
 const canvas = document.getElementById("canvas");
 const ctx = canvas.getContext("2d");
 const status = document.getElementById("status");
 const startBtn = document.getElementById("startBtn");
 const faceList = document.getElementById("faceList");
 const handList = document.getElementById("handList");
 const toggleNumbers = document.getElementById("toggleNumbers");

 let detector = null;
 let isDetecting = false;
 let showNumbers = true;  // Toggle for showing numbers
let handModel = null;
let hands = [];
let handDetector = null;

// Colors for different hands
const handColors = [
    "#FF0000",
    "#00FF00",
    "#0088FF",
    "#FF00FF",
    "#FFFF00",
    "#00FFFF",
];

// Hand landmark connections
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20]
];

const LANDMARK_NAMES = [
  "Wrist","Thumb CMC","Thumb MCP","Thumb IP","Thumb Tip",
  "Index MCP","Index PIP","Index DIP","Index Tip",
  "Middle MCP","Middle PIP","Middle DIP","Middle Tip",
  "Ring MCP","Ring PIP","Ring DIP","Ring Tip",
  "Pinky MCP","Pinky PIP","Pinky DIP","Pinky Tip"
];

function getDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function drawHandBoundingBox(keypoints, color, label) {
    const xs = keypoints.map(p => p.x);
    const ys = keypoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
    if (label) {
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.fillText(label, minX - 4, minY - 10);
    }
}

function drawHandLandmarks(keypoints, color) {
    // draw points
    keypoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '10px Arial';
            ctx.fillText(String(i), p.x + 6, p.y - 6);
        }
    });

    // draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    HAND_CONNECTIONS.forEach(([a, b]) => {
        const p1 = keypoints[a];
        const p2 = keypoints[b];
        if (!p1 || !p2) return;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });
}

 // Colors for different faces (made neutral to avoid red visual tracking)
 const faceColors = [
     "rgba(228,228,228,0.9)",
     "rgba(200,200,200,0.85)",
     "rgba(180,180,180,0.8)",
     "rgba(160,160,160,0.75)",
     "rgba(140,140,140,0.7)",
     "rgba(120,120,120,0.65)"
 ];

 // Facial feature regions (indices for specific landmarks)
 const FACE_REGIONS = {
     leftEye: [33, 133, 160, 159, 158, 157, 173, 155, 154, 153, 145, 144, 163, 7],
     rightEye: [362, 263, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390, 249],
     lips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
     leftEyebrow: [70, 63, 105, 66, 107, 55, 65],
     rightEyebrow: [336, 296, 334, 293, 300, 285, 295],
     nose: [1, 2, 98, 327, 168]
 };

 // Load the Face Landmarks Detection model
 async function loadModel() {
     try {
         status.textContent = "Loading face detection model...";
         
         await tf.setBackend('webgl');
         await tf.ready();
         
         detector = await faceLandmarksDetection.createDetector(
             faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
             {
                 runtime: 'mediapipe',
                 solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
                 refineLandmarks: true,
                 maxFaces: 5
             }
         );
         
         status.textContent = "Model loaded! Click 'Start Camera'";
         startBtn.disabled = false;
         console.log("Face detection model loaded successfully!");
        // try to load hand model (optional)
        try {
            handModel = await handpose.load();
            console.log('Handpose model loaded');
        } catch (e) {
            console.warn('Handpose model not available:', e && e.message);
            handModel = null;
        }
        // then try the newer tfjs hand-pose-detection MediaPipe Hands detector (preferred)
        try {
            if (window.handPoseDetection && handPoseDetection.createDetector) {
                handDetector = await handPoseDetection.createDetector(
                    handPoseDetection.SupportedModels.MediaPipeHands,
                    {
                        runtime: 'mediapipe',
                        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
                        modelType: 'full',
                        maxHands: 4
                    }
                );
                console.log('MediaPipe Hands detector loaded');
            }
        } catch (e) {
            console.warn('Hand detector not available:', e && e.message);
            handDetector = null;
        }
     } catch (error) {
         status.textContent = "Error loading model: " + error.message;
         console.error(error);
     }
 }

 // Start the webcam
 async function startCamera() {
     try {
         const stream = await navigator.mediaDevices.getUserMedia({
             video: { 
                 width: { ideal: 960 },
                 height: { ideal: 720 },
                 facingMode: "user"
             },
         });
         video.srcObject = stream;

         video.addEventListener("loadeddata", () => {
             // Force canvas to match EXACT video dimensions
             const videoWidth = video.videoWidth;
             const videoHeight = video.videoHeight;
             
             canvas.width = videoWidth;
             canvas.height = videoHeight;
             
             // Also update the display size
             video.width = videoWidth;
             video.height = videoHeight;
             
             console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
             
             status.textContent = "Detecting faces...";
             startBtn.textContent = "Camera Running";
             startBtn.disabled = true;
             detectFaces();
         });
     } catch (error) {
         status.textContent = "Error accessing camera: " + error.message;
         console.error(error);
     }
 }

 // Draw a specific facial region
 function drawRegion(keypoints, indices, color) {
     if (indices.length < 2) return;

     ctx.beginPath();
     ctx.strokeStyle = color;
     ctx.lineWidth = 2;

     for (let i = 0; i < indices.length; i++) {
         const point = keypoints[indices[i]];
         if (i === 0) {
             ctx.moveTo(point.x, point.y);
         } else {
             ctx.lineTo(point.x, point.y);
         }
     }
     ctx.closePath();
     ctx.stroke();
 }

 // Draw bounding box around face
 function drawBoundingBox(keypoints, color) {
     const xs = keypoints.map(p => p.x);
     const ys = keypoints.map(p => p.y);
     
     const minX = Math.min(...xs);
     const maxX = Math.max(...xs);
     const minY = Math.min(...ys);
     const maxY = Math.max(...ys);
     
     ctx.strokeStyle = color;
     ctx.lineWidth = 3;
     ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
 }

 // Main face detection loop
 async function detectFaces() {
     if (!detector) return;

     isDetecting = true;

     // Detect faces
     const faces = await detector.estimateFaces(video, {
         flipHorizontal: false
     });

    // detect hands: prefer the newer handDetector (MediaPipe Hands) if available
    hands = [];
    if (handDetector) {
        try {
            const raw = await handDetector.estimateHands(video, { flipHorizontal: false });
            // normalize to { keypoints: [{x,y,z}], handedness, score }
            hands = raw.map(h => {
                const kps = (h.keypoints || h.landmarks || []).map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
                return { keypoints: kps, handedness: (h.handedness && h.handedness[0] && h.handedness[0].label) || h.handedness || (h.handednessLabel || 'Unknown'), score: h.score || (h.handInViewConfidence || 1) };
            });
        } catch (e) {
            console.warn('handDetector error', e && e.message);
            hands = [];
        }
    } else if (handModel) {
        try {
            const raw = await handModel.estimateHands(video, true);
            // handpose returns objects with landmarks: array of [x,y,z] and annotations
            hands = raw.map(h => {
                const kps = (h.landmarks || []).map(p => ({ x: p[0], y: p[1], z: p[2] || 0 }));
                return { keypoints: kps, annotations: h.annotations || {}, handedness: h.handedness || 'Unknown', score: h.score || 1 };
            });
        } catch (e) {
            hands = [];
        }
    }

     // Clear canvas
     ctx.clearRect(0, 0, canvas.width, canvas.height);

     // Draw each face with different color
     let infoHTML = "";

     if (faces.length > 0) {
         infoHTML = `<div style="margin-bottom: 10px;"><strong>Tracking ${faces.length} face(s)</strong></div>`;

         faces.forEach((face, index) => {
             const color = faceColors[index % faceColors.length];
             
            // Tracking visuals hidden (bounding box and landmarks removed)

            // MOUTH DETECTION: check if mouth is open, draw xray overlay if so
            const mouthOpen = isMouthOpen(face.keypoints);
            if (mouthOpen) {
                // draw the xray overlay aligned to mouth
                const mouthOverlay = drawXrayMouth(face.keypoints);

                // if there are hands detected, handle finger -> tooth interaction
                if (hands && hands.length > 0) {
                    // map first hand's index finger tip
                    const hand = hands[0];
                    const indexTip = hand.annotations && hand.annotations.indexFinger ? hand.annotations.indexFinger[3] : null;
                    // handpose returns 3D points in pixels [x,y,z]
                    if (indexTip) {
                        const fingerPoint = { x: indexTip[0], y: indexTip[1] };
                        if (isFingerInsideMouth(fingerPoint, face.keypoints)) {
                            const mapped = mapFingerToOverlay(fingerPoint, face.keypoints, mouthOverlay);
                            drawFillingOnPoint(mapped, face.keypoints);
                        }
                    }
                }
            }

             // Add info for this face
             const confidence = face.box ? 
                 `${(face.box.probability * 100).toFixed(1)}%` : 
                 "High confidence";

             infoHTML += `<div class="face-info" style="border-color: ${color};">`;
             infoHTML += `<strong>Face ${index + 1}</strong><br>`;
             infoHTML += `<div style="margin: 5px 0;">`;
             infoHTML += `<span class="feature-info">✓ Left Eye</span>`;
             infoHTML += `<span class="feature-info">✓ Right Eye</span>`;
             infoHTML += `<span class="feature-info">✓ Nose</span>`;
             infoHTML += `<span class="feature-info">✓ Mouth</span>`;
             infoHTML += `<span class="feature-info">✓ Eyebrows</span>`;
             infoHTML += `<span class="feature-info">✓ Face Contour</span>`;
             infoHTML += `</div>`;
             infoHTML += `</div>`;
         });
     } else {
         infoHTML = "<div>No faces detected - look at the camera!</div>";
     }

    faceList.innerHTML = infoHTML;

    // Render hand info list
    let handHTML = '';
    if (hands && hands.length > 0) {
        handHTML = `<div style="margin-bottom:10px"><strong>Tracking ${hands.length} hand(s)</strong></div>`;
        hands.forEach((h, i) => {
            const color = handColors[i % handColors.length];
            const label = h.handedness || 'Hand';
            handHTML += `<div class="hand-info" style="border-left:4px solid ${color}; padding:6px; margin-bottom:6px;">`;
            handHTML += `<strong>${label}</strong> — ${h.keypoints ? h.keypoints.length : 0} pts`;
            handHTML += `<div style="font-size:12px; margin-top:6px;">Detection: ${h.score ? (h.score*100).toFixed(1)+'%' : 'n/a'}</div>`;
            if (showNumbers && h.keypoints) {
                const keys = [0,4,8,12,16,20].map(idx => `${idx}:${LANDMARK_NAMES[idx] || idx}`).join(' &nbsp; ');
                handHTML += `<div style="font-size:11px; margin-top:6px;">${keys}</div>`;
            }
            handHTML += `</div>`;
        });
    } else {
        handHTML = '<div>No hands detected - show your hands to the camera!</div>';
    }
    if (handList) handList.innerHTML = handHTML;

    // Draw hands on canvas (over the faces overlays)
    if (hands && hands.length > 0) {
        hands.forEach((h, i) => {
            const color = handColors[i % handColors.length];
            if (h.keypoints && h.keypoints.length > 0) {
                drawHandBoundingBox(h.keypoints, color, h.handedness || 'Hand');
                drawHandLandmarks(h.keypoints, color);

                // if hand is near mouth of any detected face, we can map fingertip to overlay
                // try index fingertip (8)
                const tip = h.keypoints[8];
                if (tip && faces && faces.length > 0) {
                    faces.forEach(face => {
                        if (isMouthOpen(face.keypoints) && isFingerInsideMouth(tip, face.keypoints)) {
                            const mouthOverlay = drawXrayMouth(face.keypoints);
                            const mapped = mapFingerToOverlay(tip, face.keypoints, mouthOverlay);
                            drawFillingOnPoint(mapped, face.keypoints);
                        }
                    });
                }
            }
        });
    }

     // Continue detection loop
     if (isDetecting) {
         requestAnimationFrame(detectFaces);
     }
 }

 // Event listeners
 startBtn.addEventListener("click", startCamera);
 
 toggleNumbers.addEventListener("click", () => {
     showNumbers = !showNumbers;
     toggleNumbers.textContent = showNumbers ? "Hide Numbers" : "Show Numbers";
 });

 // Load model when page loads
 loadModel();

 function drawXrayMouth(face) {
    const left = face[61];
    const right = face[291];
    const top = face[0];
    const bottom = face[17];

    // keypoints are in pixel coordinates; compute mouth box in pixels
    const mouthX = left.x;
    const mouthY = top.y;

    const mouthW = (right.x - left.x) * 2.4;
    const mouthH = (bottom.y - top.y) * 1.45;

    const drawX = mouthX - mouthW * 0.3;
    const drawY = mouthY - mouthH * 0.08;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.58;

  ctx.drawImage(
    dentaturaFrontale,
    drawX,
    drawY,
    mouthW,
    mouthH
  );

  ctx.restore();

    return { x: drawX, y: drawY, w: mouthW, h: mouthH };
}

// ---------------------- Helper functions for interactions ------------------

function isMouthOpen(keypoints) {
    // use landmarks 13 (top lip) and 14 (bottom lip) vertical distance
    const top = keypoints[13];
    const bottom = keypoints[14];
    if (!top || !bottom) return false;
    const dy = Math.abs(bottom.y - top.y);
    // threshold relative to face height (use vertical span of keypoints)
    const ys = keypoints.map(p => p.y);
    const faceH = Math.max(...ys) - Math.min(...ys) || 1;
    const rel = dy / faceH;
    // tuned threshold: mouth open when vertical gap > ~0.035 of face height
    return rel > 0.035;
}

function isFingerInsideMouth(fingerPoint, keypoints) {
    // fingerPoint in pixel coords {x,y}
    const left = keypoints[61];
    const right = keypoints[291];
    const top = keypoints[13];
    const bottom = keypoints[14];
    if (!left || !right || !top || !bottom) return false;
    const minX = left.x;
    const maxX = right.x;
    const minY = top.y;
    const maxY = bottom.y;
    return fingerPoint.x >= minX && fingerPoint.x <= maxX && fingerPoint.y >= minY && fingerPoint.y <= maxY;
}

function mapFingerToOverlay(fingerPoint, keypoints, overlayBox) {
    // overlayBox returned by drawXrayMouth: { x, y, w, h }
    const left = keypoints[61];
    const right = keypoints[291];
    const top = keypoints[13];
    const bottom = keypoints[14];
    const minX = left.x;
    const maxX = right.x;
    const minY = top.y;
    const maxY = bottom.y;
    const relativeX = (fingerPoint.x - minX) / (maxX - minX);
    const relativeY = (fingerPoint.y - minY) / (maxY - minY);
    const overlayX = overlayBox.x + relativeX * overlayBox.w;
    const overlayY = overlayBox.y + relativeY * overlayBox.h;
    return { x: overlayX, y: overlayY, relX: relativeX, relY: relativeY };
}


// Draw all facial landmarks (points + optional numbers) and small circles
function drawFaceLandmarks(keypoints, color) {
    // keypoints are already in pixel coordinates (x,y). Draw points and optional indices
    keypoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '8px Arial';
            ctx.fillText(String(index), point.x + 3, point.y - 3);
        }
    });

    // draw regions for clarity
    drawRegion(keypoints, FACE_REGIONS.leftEye, color);
    drawRegion(keypoints, FACE_REGIONS.rightEye, color);
    drawRegion(keypoints, FACE_REGIONS.lips, color);
    drawRegion(keypoints, FACE_REGIONS.leftEyebrow, color);
    drawRegion(keypoints, FACE_REGIONS.rightEyebrow, color);
    drawRegion(keypoints, FACE_REGIONS.nose, color);
}

function drawFillingOnPoint(mappedPoint, face) {
    // mappedPoint: { x, y, relX, relY } in overlay pixel coords
    if (!mappedPoint) return;

    const mouthBox = drawXrayMouth(face);
    const size = mouthBox.w * 0.12;

    // visual style: jitter + slight alpha flicker
    const jitterX = (Math.random() - 0.5) * 4; // ±2px
    const jitterY = (Math.random() - 0.5) * 4;
    const flicker = 0.55 + Math.sin(Date.now() / 120) * 0.05; // oscillate around 0.55

    const drawX = mappedPoint.x + jitterX - size / 2;
    const drawY = mappedPoint.y + jitterY - size / 2;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.max(0.5, Math.min(0.65, flicker));

    // draw slightly degraded (lower quality) by drawing at slight scale and with alpha
    ctx.drawImage(otturazione, drawX, drawY, size, size);

    // optional additional noise: small translucent overlay
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(drawX - 1, drawY - 1, size + 2, size + 2);

    ctx.restore();

    status.textContent = "Restoration detected.";
}
 
 
 