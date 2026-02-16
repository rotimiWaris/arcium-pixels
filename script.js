// ONLY WANNA RUN THE CODE WHEN BROWSER LOADS
window.addEventListener("load", function () {
  const canvas = document.querySelector("canvas");
  const sourceImage = document.getElementById("image");
  // Add willReadFrequently option
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const modal = document.getElementById("modal");
  const modalCanvas = document.getElementById("modalCanvas");
  const modalCtx = modalCanvas ? modalCanvas.getContext("2d") : null;
  const closeModalButton = document.querySelector(".close");

  // SETTING CANVAS HEIGHT AND WIDTH
  function setCanvasSize() {
    const viewportPadding = 24;
    const maxCanvasWidth = Math.max(
      180,
      window.innerWidth - viewportPadding * 2,
    );
    const maxCanvasHeight = Math.max(
      180,
      window.innerHeight - viewportPadding * 2,
    );
    const imageWidth = sourceImage.naturalWidth || sourceImage.width || 16;
    const imageHeight = sourceImage.naturalHeight || sourceImage.height || 9;
    const imageRatio = imageWidth / imageHeight;

    let width = Math.min(maxCanvasWidth, 1200);
    let height = width / imageRatio;

    if (height > maxCanvasHeight) {
      height = maxCanvasHeight;
      width = height * imageRatio;
    }

    canvas.width = Math.max(180, Math.floor(width));
    canvas.height = Math.max(180, Math.floor(height));
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }
  setCanvasSize();

  // CLASS FOR EACH PARTICLE
  class Particle {
    constructor(effect, x, y, size) {
      this.effect = effect;
      this.originX = Math.floor(x);
      this.originY = Math.floor(y);
      this.x = this.originX;
      this.y = this.originY;
      this.color = "#ffffff";
      this.size = size;
      this.ease = 0.4;
    }
    draw(context) {
      context.fillStyle = this.color;
      context.beginPath();
      context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      context.fill();
    }
    update() {
      this.x += (this.originX - this.x) * this.ease;
      this.y += (this.originY - this.y) * this.ease;
    }
  }

  // CLASS FOR ALL PARTICLE
  class Effect {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.particleArray = [];
      this.image = document.getElementById("image");
      this.baseParticleSize = 2.5;
      this.minParticleSize = 0.25;
      this.particleSize = this.baseParticleSize;
      this.gap = 6;
      this.maxParticles = 800;
      this.updateLayout();
    }

    updateLayout() {
      this.centerX = this.width * 0.5;
      this.centerY = this.height * 0.5;

      const imageWidth = this.image.naturalWidth || this.image.width;
      const imageHeight = this.image.naturalHeight || this.image.height;
      const maxRenderWidth = this.width * 0.8;
      const maxRenderHeight = this.height * 0.8;
      const scale = Math.min(
        maxRenderWidth / imageWidth,
        maxRenderHeight / imageHeight,
        1,
      );

      this.renderWidth = Math.floor(imageWidth * scale);
      this.renderHeight = Math.floor(imageHeight * scale);
      this.x = Math.floor(this.centerX - this.renderWidth * 0.5);
      this.y = Math.floor(this.centerY - this.renderHeight * 0.5);
    }

    init(context) {
      this.particleArray = [];

      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = this.renderWidth;
      offscreenCanvas.height = this.renderHeight;
      const offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      offscreenCtx.drawImage(
        this.image,
        0,
        0,
        this.renderWidth,
        this.renderHeight,
      );

      const imageData = offscreenCtx.getImageData(
        0,
        0,
        this.renderWidth,
        this.renderHeight,
      );
      const pixels = imageData.data;
      const visiblePixels = [];

      const getColorAt = (x, y) => {
        const index = (y * this.renderWidth + x) * 4;
        return [pixels[index], pixels[index + 1], pixels[index + 2]];
      };

      const topLeft = getColorAt(0, 0);
      const topRight = getColorAt(this.renderWidth - 1, 0);
      const bottomLeft = getColorAt(0, this.renderHeight - 1);
      const bottomRight = getColorAt(
        this.renderWidth - 1,
        this.renderHeight - 1,
      );
      const bgColor = [
        Math.floor(
          (topLeft[0] + topRight[0] + bottomLeft[0] + bottomRight[0]) / 4,
        ),
        Math.floor(
          (topLeft[1] + topRight[1] + bottomLeft[1] + bottomRight[1]) / 4,
        ),
        Math.floor(
          (topLeft[2] + topRight[2] + bottomLeft[2] + bottomRight[2]) / 4,
        ),
      ];

      const colorDistance = (r, g, b, bg) => {
        const dr = r - bg[0];
        const dg = g - bg[1];
        const db = b - bg[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const collectVisiblePixels = (step) => {
        const candidates = [];
        for (let y = 0; y < this.renderHeight; y += step) {
          for (let x = 0; x < this.renderWidth; x += step) {
            const index = (y * this.renderWidth + x) * 4;
            const alpha = pixels[index + 3];
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            if (alpha > 40 && colorDistance(red, green, blue, bgColor) > 35) {
              candidates.push({ x: this.x + x, y: this.y + y });
            }
          }
        }
        return candidates;
      };

      visiblePixels.push(...collectVisiblePixels(this.gap));

      // If candidates are too few, sample every pixel for dense placement.
      if (visiblePixels.length < this.maxParticles) {
        visiblePixels.length = 0;
        visiblePixels.push(...collectVisiblePixels(1));
      }

      // Fallback to opaque pixels if foreground detection is too strict.
      if (visiblePixels.length < this.maxParticles) {
        visiblePixels.length = 0;
        for (let y = 0; y < this.renderHeight; y++) {
          for (let x = 0; x < this.renderWidth; x++) {
            const index = (y * this.renderWidth + x) * 4;
            if (pixels[index + 3] > 40) {
              visiblePixels.push({ x: this.x + x, y: this.y + y });
            }
          }
        }
      }

      const totalVisible = visiblePixels.length;
      const particleCount = Math.min(this.maxParticles, totalVisible);
      let selectedPixels = [];

      if (particleCount > 0) {
        const usedIndices = new Set();
        const step = totalVisible / Math.max(particleCount, 1);
        for (let i = 0; i < particleCount; i++) {
          const index = Math.floor(i * step);
          if (!usedIndices.has(index) && visiblePixels[index]) {
            usedIndices.add(index);
            selectedPixels.push(visiblePixels[index]);
          }
        }

        if (selectedPixels.length < particleCount) {
          for (let i = 0; i < totalVisible; i++) {
            if (!usedIndices.has(i)) {
              usedIndices.add(i);
              selectedPixels.push(visiblePixels[i]);
              if (selectedPixels.length >= particleCount) break;
            }
          }
        }

        // Last resort only if the source shape has fewer than 400 unique candidates.
        if (selectedPixels.length < particleCount) {
          while (
            selectedPixels.length < particleCount &&
            visiblePixels.length > 0
          ) {
            selectedPixels.push(
              visiblePixels[selectedPixels.length % visiblePixels.length],
            );
          }
        }

        // Auto-fit radius using a robust spacing estimate.
        // Using a percentile avoids tiny outliers forcing all particles to shrink.
        const nearestDistances = [];
        for (let i = 0; i < selectedPixels.length; i++) {
          let localMin = Infinity;
          for (let j = 0; j < selectedPixels.length; j++) {
            if (i === j) continue;
            const dx = selectedPixels[i].x - selectedPixels[j].x;
            const dy = selectedPixels[i].y - selectedPixels[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < localMin) localMin = dist;
          }
          if (Number.isFinite(localMin)) nearestDistances.push(localMin);
        }

        nearestDistances.sort((a, b) => a - b);
        const p35Index = Math.max(
          0,
          Math.min(
            nearestDistances.length - 1,
            Math.floor(nearestDistances.length * 0.35),
          ),
        );
        const spacingReference = nearestDistances[p35Index];
        const fittedSize = Number.isFinite(spacingReference)
          ? spacingReference * 0.49
          : this.baseParticleSize;
        const wideScreenFloor =
          this.width >= 1000
            ? 3.4
            : this.width >= 700
              ? 2.6
              : this.minParticleSize;
        this.particleSize = Math.max(
          wideScreenFloor,
          this.minParticleSize,
          Math.min(this.baseParticleSize, fittedSize),
        );

        for (let i = 0; i < selectedPixels.length; i++) {
          const pixel = selectedPixels[i];
          this.particleArray.push(
            new Particle(this, pixel.x, pixel.y, this.particleSize),
          );
        }
      }

      context.clearRect(0, 0, this.width, this.height);
      console.log(
        `[particles] generated: ${this.particleArray.length} | size: ${this.particleSize}`,
      );
    }

    draw(context) {
      this.particleArray.forEach((particle) => particle.draw(context));
    }

    update() {
      this.particleArray.forEach((particle) => particle.update());
    }

    // Add a resize method to handle window resizing more cleanly
    resize(width, height) {
      this.width = width;
      this.height = height;
      this.updateLayout();

      // Reset particles
      this.particleArray = [];
    }

    getParticleAt(x, y) {
      for (let i = this.particleArray.length - 1; i >= 0; i--) {
        const particle = this.particleArray[i];
        const dx = x - particle.x;
        const dy = y - particle.y;
        if (dx * dx + dy * dy <= particle.size * particle.size) {
          return particle;
        }
      }
      return null;
    }
  }

  // CALLING THE EFFECT
  let effect;
  function rebuildEffect() {
    effect = new Effect(canvas.width, canvas.height);
    effect.init(ctx);
  }
  rebuildEffect();

  // ANIMATION
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    effect.draw(ctx);
    effect.update();
    requestAnimationFrame(animate);
  }

  animate();

  function openModalForParticle(particle) {
    if (!modal || !modalCanvas || !modalCtx || !particle) return;

    const modalSize = 360;
    modalCanvas.width = modalSize;
    modalCanvas.height = modalSize;
    modalCtx.clearRect(0, 0, modalSize, modalSize);
    modalCtx.fillStyle = "#000000";
    modalCtx.fillRect(0, 0, modalSize, modalSize);
    modalCtx.fillStyle = particle.color;
    modalCtx.beginPath();
    modalCtx.arc(
      modalSize * 0.5,
      modalSize * 0.5,
      particle.size,
      0,
      Math.PI * 2,
    );
    modalCtx.fill();

    modal.style.display = "flex";
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
  }

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const clickedParticle = effect.getParticleAt(x, y);
    if (clickedParticle) openModalForParticle(clickedParticle);
  });

  if (closeModalButton) {
    closeModalButton.addEventListener("click", closeModal);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  // Optimized resize handler
  let resizeTimeout;
  window.addEventListener("resize", () => {
    // Debounce resize to prevent too many recalculations
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      setCanvasSize();

      // Completely rebuild particles/effect on resize for stable positioning.
      rebuildEffect();
    }, 100);
  });
});
