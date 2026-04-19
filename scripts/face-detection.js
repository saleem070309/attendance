/**
 * Face Detection Engine using MediaPipe Tasks Vision
 * Optimized for "Face as Barcode" automated attendance.
 */

const FaceDetection = {
    detector: null,
    video: null,
    canvas: null,
    ctx: null,
    isActive: false,
    
    // Stability tracking
    lastBox: null,
    stableFrames: 0,
    STABILITY_THRESHOLD: 0.03, // 3% variance allowed
    REQUIRED_STABLE_FRAMES: 15, // 0.5 seconds at 30fps
    
    onCapture: null, // Callback when face is locked

    async init(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        if (canvasElement) this.ctx = canvasElement.getContext('2d');

        if (this.detector) return; // Already initialized

        try {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );
            
            this.detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
                    delegate: "GPU"
                },
                runningMode: "video"
            });
            
            console.log("Face Detector Initialized");
        } catch (e) {
            console.error("Face Detector Init Failed:", e);
            throw e;
        }
    },

    setElements(video, canvas) {
        this.video = video;
        this.canvas = canvas;
        if (canvas) this.ctx = canvas.getContext('2d');
    },

    start() {
        if (!this.detector) return;
        this.isActive = true;
        this.lastBox = null;
        this.stableFrames = 0;
        this.predictLoop();
    },

    stop() {
        this.isActive = false;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    async predictLoop() {
        if (!this.isActive) return;

        // Ensure video is ready and has valid dimensions to avoid "ROI width/height must be > 0" errors
        if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            try {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                
                const startTimeMs = performance.now();
                const result = this.detector.detectForVideo(this.video, startTimeMs);
                
                if (result && result.detections) {
                    this.drawDetections(result.detections);
                    this.checkStability(result.detections);
                }
            } catch (err) {
                console.warn("Face detection frame error:", err);
            }
        }

        requestAnimationFrame(() => this.predictLoop());
    },

    drawDetections(detections) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        detections.forEach(detection => {
            let { originX, originY, width, height } = detection.boundingBox;
            
            // Fix X-axis tracking mirror issue
            // Since the canvas has scale-x-[-1] in CSS, we need to adjust drawing coordinates
            // if MediaPipe is detecting on the unmirrored buffer.
            // If the user says it's "opposite", then we need to flip the X coordinate here.
            originX = this.canvas.width - originX - width;

            const centerX = originX + width / 2;
            const centerY = originY + height / 2;
            const radius = Math.max(width, height) * 0.7; // Refined Face ID style radius

            const isStableEnough = this.stableFrames > (this.REQUIRED_STABLE_FRAMES / 3);
            const progress = this.stableFrames / this.REQUIRED_STABLE_FRAMES;

            // Premium Face ID Design
            this.ctx.save();
            
            // 1. Draw Subtle outer ring
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(122, 175, 255, 0.2)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 10]);
            this.ctx.stroke();

            // 2. Draw Progress Ring (Face ID Style)
            if (this.stableFrames > 0) {
                this.ctx.setLineDash([]); // Reset dash
                this.ctx.beginPath();
                // Start from top (-PI/2)
                this.ctx.arc(centerX, centerY, radius, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
                
                // Dynamic Color based on stability
                const gradient = this.ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
                gradient.addColorStop(0, '#7aafff');
                gradient.addColorStop(1, '#a0c4ff');
                
                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = 6;
                this.ctx.lineCap = 'round';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = 'rgba(122, 175, 255, 0.5)';
                this.ctx.stroke();
            }

            // 3. Draw Scanline Pulse
            if (isStableEnough) {
                const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius * (0.9 + pulse * 0.1), 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(122, 175, 255, ${0.1 + pulse * 0.2})`;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }

            // 4. Draw Locking Corners (Refined)
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = isStableEnough ? '#7aafff' : 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 3;
            const cornerLen = 30;
            
            // Draw 4 corners around the circle area
            const corners = [
                {x: centerX - radius, y: centerY - radius, dx: 1, dy: 1},
                {x: centerX + radius, y: centerY - radius, dx: -1, dy: 1},
                {x: centerX - radius, y: centerY + radius, dx: 1, dy: -1},
                {x: centerX + radius, y: centerY + radius, dx: -1, dy: -1}
            ];

            corners.forEach(c => {
                this.ctx.beginPath();
                this.ctx.moveTo(c.x, c.y + c.dy * cornerLen);
                this.ctx.lineTo(c.x, c.y);
                this.ctx.lineTo(c.x + c.dx * cornerLen, c.y);
                this.ctx.stroke();
            });

            this.ctx.restore();
        });
    },

    checkStability(detections) {
        if (detections.length === 0) {
            this.stableFrames = 0;
            this.lastBox = null;
            return;
        }

        // Focus on the biggest face
        const biggestFace = detections.reduce((prev, current) => 
            (prev.boundingBox.width * prev.boundingBox.height > current.boundingBox.width * current.boundingBox.height) ? prev : current
        );

        const currentBox = biggestFace.boundingBox;

        if (this.lastBox) {
            const dx = Math.abs(currentBox.originX - this.lastBox.originX) / this.canvas.width;
            const dy = Math.abs(currentBox.originY - this.lastBox.originY) / this.canvas.height;
            const dw = Math.abs(currentBox.width - this.lastBox.width) / this.canvas.width;
            
            if (dx < this.STABILITY_THRESHOLD && dy < this.STABILITY_THRESHOLD && dw < this.STABILITY_THRESHOLD) {
                this.stableFrames++;
            } else {
                this.stableFrames = 0;
            }
        }

        this.lastBox = currentBox;

        if (this.stableFrames >= this.REQUIRED_STABLE_FRAMES) {
            this.isActive = false; // Pause loop
            if (this.onCapture) this.onCapture();
            this.stableFrames = 0;
        }
    }
};
