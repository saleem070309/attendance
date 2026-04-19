/**
 * UI Utilities for Attendance System
 * Provides Toasts, Skeletons, and Optimistic UI helpers.
 */

const UI = {
    // Top Progress Bar (YouTube Style)
    progressElement: null,

    init() {
        if (!document.getElementById('global-progress')) {
            const progress = document.createElement('div');
            progress.id = 'global-progress';
            progress.className = 'fixed top-0 left-0 h-[3px] bg-primary z-[1000] transition-all duration-300 opacity-0 shadow-[0_0_10px_rgba(122,175,255,0.7)]';
            progress.style.width = '0%';
            document.body.appendChild(progress);
            this.progressElement = progress;
        }
    },

    setLoading(isLoading) {
        if (!this.progressElement) this.init();
        if (isLoading) {
            this.progressElement.style.width = '30%';
            this.progressElement.classList.remove('opacity-0');
            setTimeout(() => { if (this.progressElement.style.width === '30%') this.progressElement.style.width = '70%'; }, 500);
        } else {
            this.progressElement.style.width = '100%';
            setTimeout(() => {
                this.progressElement.classList.add('opacity-0');
                setTimeout(() => { this.progressElement.style.width = '0%'; }, 300);
            }, 200);
        }
    },

    toast(message, type = 'success') {
        const toast = document.createElement('div');
        const icon = type === 'success' ? 'check_circle' : (type === 'error' ? 'cancel' : 'info');
        const colors = {
            success: 'bg-green-500/20 text-green-400 border-green-500/30',
            error: 'bg-red-500/20 text-red-400 border-red-500/30',
            info: 'bg-primary/20 text-primary border-primary/30'
        };

        toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-4 rounded-2xl backdrop-blur-xl border ${colors[type]} z-[1000] shadow-2xl transition-all duration-500 translate-y-20 opacity-0`;
        toast.innerHTML = `
            <span class="material-symbols-outlined">${icon}</span>
            <span class="font-bold text-sm">${message}</span>
        `;
        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-20', 'opacity-0');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    showSkeleton(container, type = 'card', count = 3) {
        if (!container) return;
        let html = '';
        const skeletonClass = "bg-white/5 animate-pulse rounded-2xl border border-white/5";
        
        for (let i = 0; i < count; i++) {
            if (type === 'card') {
                html += `
                <div class="${skeletonClass} h-48 w-full overflow-hidden">
                    <div class="h-2/3 bg-white/5"></div>
                    <div class="p-4 space-y-2">
                        <div class="h-4 w-1/2 bg-white/5 rounded"></div>
                        <div class="h-3 w-1/3 bg-white/5 rounded"></div>
                    </div>
                </div>`;
            } else if (type === 'list-item') {
                html += `
                <div class="${skeletonClass} p-4 flex items-center justify-between">
                    <div class="flex items-center gap-3 w-full">
                        <div class="w-12 h-12 rounded-full bg-white/10"></div>
                        <div class="space-y-2 flex-1">
                            <div class="h-4 w-1/3 bg-white/10 rounded"></div>
                            <div class="h-3 w-1/4 bg-white/10 rounded"></div>
                        </div>
                    </div>
                    <div class="w-20 h-8 rounded-full bg-white/10"></div>
                </div>`;
            }
        }
        container.innerHTML = html;
    },

    async optimistic(element, actionPromise, errorMessage = 'حدث خطأ أثناء التنفيذ') {
        if (!element) return await actionPromise;
        const originalOpacity = element.computedStyleMap ? element.computedStyleMap().get('opacity').value : element.style.opacity;
        const originalTransform = element.style.transform;
        const originalDisplay = element.style.display;

        // Apply immediate visual feedback
        element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        element.style.opacity = '0';
        element.style.transform = 'scale(0.9) translateY(10px)';
        
        // Hide from layout almost immediately (after a very short delay for animation start)
        const hideTimeout = setTimeout(() => {
            element.style.display = 'none';
        }, 150);

        try {
            await actionPromise;
            // Succeeded: element will stay hidden/removed
            // If the parent calls a re-render eventually, it's fine.
        } catch (error) {
            clearTimeout(hideTimeout);
            console.error(error);
            // Restore immediately on error
            element.style.display = originalDisplay;
            element.style.opacity = originalOpacity;
            element.style.transform = originalTransform;
            this.toast(errorMessage, 'error');
        }
    },

    /**
     * Smart Image Compression
     * Resizes and compresses image to stay near target size
     * @param {HTMLCanvasElement} canvas 
     * @param {number} quality 0.1 to 1.0
     * @param {number} maxWidth Maximum width in pixels
     * @returns {string} base64 encoded jpeg (no header)
     */
    compressImage(canvas, quality = 0.6, maxWidth = 1024) {
        let width = canvas.width;
        let height = canvas.height;

        // Resize if too large
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }

        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(canvas, 0, 0, width, height);

        // JPEG compression
        const dataUrl = offscreen.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        
        // Log size for debugging
        const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        console.log(`[UI] Image Compressed: ${width}x${height}, Quality: ${quality}, Size: ${sizeKB}KB`);
        
        return base64;
    },

    confirm(title, message, options = {}) {
        const {
            confirmText = 'تأكيد',
            cancelText = 'إلغاء',
            type = 'danger'
        } = options;

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 liquid-dialog-overlay opacity-0';
            
            const btnColor = type === 'danger' ? 'bg-error text-white' : 'bg-primary text-on-primary';
            const icon = type === 'danger' ? 'warning' : 'info';
            const iconColor = type === 'danger' ? 'text-error' : 'text-primary';

            overlay.innerHTML = `
                <div class="liquid-dialog-card w-full max-w-sm rounded-[2.5rem] p-8 text-center relative overflow-hidden">
                    <!-- Decorative backglow -->
                    <div class="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 blur-[60px] rounded-full"></div>
                    
                    <div class="w-20 h-20 mx-auto rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 relative">
                         <span class="material-symbols-outlined text-4xl ${iconColor}">${icon}</span>
                    </div>

                    <h3 class="text-2xl font-black text-white mb-3 refractive-text leading-tight">${title}</h3>
                    <p class="text-on-surface-variant text-sm leading-relaxed mb-8">${message}</p>

                    <div class="flex flex-col gap-3">
                        <button id="confirmBtn" class="liquid-button ${btnColor} w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-black/20">
                            ${confirmText}
                        </button>
                        <button id="cancelBtn" class="liquid-button bg-white/5 border border-white/10 text-white w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all">
                            ${cancelText}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Animate in
            requestAnimationFrame(() => {
                overlay.classList.add('opacity-100');
                overlay.classList.add('active');
            });

            const close = (result) => {
                overlay.classList.remove('opacity-100');
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 400);
            };

            overlay.querySelector('#confirmBtn').onclick = () => close(true);
            overlay.querySelector('#cancelBtn').onclick = () => close(false);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };
        });
    },

    alert(title, message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 liquid-dialog-overlay opacity-0';
            
            overlay.innerHTML = `
                <div class="liquid-dialog-card w-full max-w-sm rounded-[2.5rem] p-8 text-center relative overflow-hidden">
                    <div class="w-20 h-20 mx-auto rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 relative">
                         <span class="material-symbols-outlined text-4xl text-primary">info</span>
                    </div>

                    <h3 class="text-2xl font-black text-white mb-3 refractive-text leading-tight">${title}</h3>
                    <p class="text-on-surface-variant text-sm leading-relaxed mb-8">${message}</p>

                    <button id="okBtn" class="liquid-button bg-primary text-on-primary w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                        حسناً
                    </button>
                </div>
            `;

            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.add('opacity-100');
                overlay.classList.add('active');
            });

            const close = () => {
                overlay.classList.remove('opacity-100');
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve();
                }, 400);
            };

            overlay.querySelector('#okBtn').onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };
        });
    }
};

// Auto-init on script load
UI.init();
