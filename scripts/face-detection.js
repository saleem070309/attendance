/**
 * Face Detection & Recognition Engine using face-api.js
 * Optimized for local "Digital Fingerprint" (Descriptor) matching.
 */

const FaceDetection = {
    nets: null,
    video: null,
    canvas: null,
    ctx: null,
    isActive: false,
    isModelsLoaded: false,
    
    // Config for different modes
    MODELS_URL: 'https://justadudewhohacks.github.io/face-api.js/models', // Public models
    
    // Stability tracking
    lastDescriptor: null,
    stableStartTime: null,
    REQUIRED_STABILITY_MS: 600, 
    
    onCapture: null, // Callback with descriptor when face is locked

    async init(videoElement = null, canvasElement = null) {
        if (videoElement) this.video = videoElement;
        if (canvasElement) {
            this.canvas = canvasElement;
            this.ctx = canvasElement.getContext('2d');
        }

        if (this.isModelsLoaded) return;

        try {
            console.log("Loading face-api.js models (and caching)...");
            // The models are loaded from this URL and will be intercepted by sw.js for caching
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(this.MODELS_URL),
                faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODELS_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(this.MODELS_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(this.MODELS_URL)
            ]);
            this.isModelsLoaded = true;
            console.log("Face API Models Ready");
        } catch (e) {
            console.error("Face API Init Failed:", e);
            throw e;
        }
    },

    /**
     * "Warm up" the engine by running a dummy detection.
     * This pre-compiles WebGL shaders and avoids lag during real use.
     */
    async warmUp() {
        if (!this.isModelsLoaded) await this.init();
        
        console.log("Warming up Face AI engine...");
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 160;
        dummyCanvas.height = 120;
        const ctx = dummyCanvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 160, 120);

        try {
            // Run both detectors once to warm up shaders
            await faceapi.detectSingleFace(dummyCanvas, new faceapi.TinyFaceDetectorOptions());
            await faceapi.detectSingleFace(dummyCanvas, new faceapi.SsdMobilenetv1Options());
        } catch (e) {
            console.warn("Warm up failed, but maybe models are okay:", e);
        }
        console.log("Face AI engine warmed up and ready.");
    },

    setElements(video, canvas) {
        this.video = video;
        this.canvas = canvas;
        if (canvas) this.ctx = canvas.getContext('2d');
    },

    start(useTiny = true, autoLock = true) {
        if (!this.isModelsLoaded) return;
        this.isActive = true;
        this.useTiny = useTiny;
        this.autoLock = autoLock;
        this.stableStartTime = null;
        this.predictLoop();
    },

    stop() {
        this.isActive = false;
        this.currentDetection = null; // Clear current detection on stop
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    async predictLoop() {
        if (!this.isActive) return;

        // Ensure video is playing and metadata is loaded
        if (this.video.readyState >= 2 && !this.video.paused) {
            try {
                // Sync canvas size only if needed
                if (this.canvas.width !== this.video.videoWidth) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                }

                // Optimization: Use smaller input size for i3 CPU
                const options = this.useTiny 
                    ? new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 })
                    : new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });

                const detection = await faceapi.detectSingleFace(this.video, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                this.currentDetection = detection; // Store globally for manual capture

                if (detection) {
                    this.drawDetections(detection);
                    if (this.autoLock) {
                        this.checkStability(detection);
                    }
                } else {
                    this.stableStartTime = null;
                    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
            } catch (err) {
                console.warn("Face detection frame error:", err);
            }
        }

        if (this.isActive) {
            // Throttling: Wait at least 50ms between frames to give CPU breathing room
            setTimeout(() => {
                if (this.isActive) requestAnimationFrame(() => this.predictLoop());
            }, 50);
        }
    },

    drawDetections(detection) {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { x, y, width, height } = detection.detection.box;
        
        // Face ID Style Ring
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const radius = Math.max(width, height) * 0.7;

        const now = performance.now();
        const elapsed = this.stableStartTime ? (now - this.stableStartTime) : 0;
        const progress = Math.min(elapsed / this.REQUIRED_STABILITY_MS, 1);

        this.ctx.save();
        
        // Background Circle
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 171, 49, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();

        // Progress Ring
        if (progress > 0) {
            this.ctx.setLineDash([]);
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
            this.ctx.strokeStyle = '#ffab31';
            this.ctx.lineWidth = 6;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();
        }

        // Scan Pulse
        if (progress > 0.5) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius * (0.9 + pulse * 0.1), 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 171, 49, ${0.1 + pulse * 0.2})`;
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }

        this.ctx.restore();
    },

    checkStability(detection) {
        if (!this.stableStartTime) {
            this.stableStartTime = performance.now();
        }

        if (performance.now() - this.stableStartTime >= this.REQUIRED_STABILITY_MS) {
            this.isActive = false;
            const descriptor = Array.from(detection.descriptor);
            if (this.onCapture) this.onCapture(descriptor);
        }
    },

    /**
     * Helper to get a descriptor from a static image (for registration)
     */
    async getDescriptorFromImage(imgElement) {
        if (!this.isModelsLoaded) await this.init();
        
        // 1. Optimization: Downscale image to max 600px to drastically speed up processing on i3
        const MAX_WIDTH = 600;
        let scale = 1;
        let sourceElement = imgElement;

        // Create a temporary canvas for downscaling
        if (imgElement.width > MAX_WIDTH || imgElement.naturalWidth > MAX_WIDTH) {
            const tempCanvas = document.createElement('canvas');
            const origWidth = imgElement.naturalWidth || imgElement.width;
            const origHeight = imgElement.naturalHeight || imgElement.height;
            scale = MAX_WIDTH / origWidth;
            
            tempCanvas.width = MAX_WIDTH;
            tempCanvas.height = origHeight * scale;
            
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(imgElement, 0, 0, tempCanvas.width, tempCanvas.height);
            sourceElement = tempCanvas;
        }

        // 2. Optimization: Try TinyFaceDetector first (fastest)
        let detection = await faceapi.detectSingleFace(sourceElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        // 3. Fallback: If Tiny fails to find a face in the static image, try SSD Mobilenet
        if (!detection) {
            console.log("TinyFaceDetector failed, falling back to SSD Mobilenet...");
            detection = await faceapi.detectSingleFace(sourceElement, new faceapi.SsdMobilenetv1Options())
                .withFaceLandmarks()
                .withFaceDescriptor();
        }
            
        return detection ? Array.from(detection.descriptor) : null;
    },

    /**
     * Local recognition: match a captured descriptor against a list of student descriptors
     */
    findBestMatch(queryDescriptor, students) {
        if (!queryDescriptor) return null;
        
        let bestMatch = null;
        let minDistance = 0.6; // Threshold for face-api.js

        students.forEach(student => {
            // Support both single descriptor and multiple descriptors (array)
            let descriptors = [];
            if (student.descriptors) {
                descriptors = typeof student.descriptors === 'string' ? JSON.parse(student.descriptors) : student.descriptors;
            } else if (student.descriptor) {
                descriptors = [typeof student.descriptor === 'string' ? JSON.parse(student.descriptor) : student.descriptor];
            }

            descriptors.forEach(savedDescriptor => {
                const distance = faceapi.euclideanDistance(queryDescriptor, savedDescriptor);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = student;
                }
            });
        });

        return bestMatch;
    }
};
