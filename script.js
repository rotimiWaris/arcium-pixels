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
  canvas.style.touchAction = "manipulation";

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

    let width = maxCanvasWidth;
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
    constructor(effect, x, y, size, id) {
      this.effect = effect;
      this.id = id;
      this.originX = x;
      this.originY = y;
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
      this.baseParticleSize = 3.5;
      this.minParticleSize = 0.25;
      this.particleSize = this.baseParticleSize;
      this.maxParticles = 512;
      this.normalizedShapePoints = this.getNormalizedShapePoints();
      this.updateLayout();
    }

    updateLayout() {
      this.centerX = this.width * 0.5;
      this.centerY = this.height * 0.5;

      const imageWidth = this.image.naturalWidth || this.image.width;
      const imageHeight = this.image.naturalHeight || this.image.height;
      const maxRenderWidth = this.width;
      const maxRenderHeight = this.height;
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

    getNormalizedShapePoints() {
      const sourceWidth = this.image.naturalWidth || this.image.width;
      const sourceHeight = this.image.naturalHeight || this.image.height;
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = sourceWidth;
      offscreenCanvas.height = sourceHeight;
      const offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      offscreenCtx.drawImage(this.image, 0, 0, sourceWidth, sourceHeight);

      const data = offscreenCtx.getImageData(
        0,
        0,
        sourceWidth,
        sourceHeight,
      ).data;
      const candidates = [];

      const getColorAt = (x, y) => {
        const index = (y * sourceWidth + x) * 4;
        return [data[index], data[index + 1], data[index + 2]];
      };
      const topLeft = getColorAt(0, 0);
      const topRight = getColorAt(sourceWidth - 1, 0);
      const bottomLeft = getColorAt(0, sourceHeight - 1);
      const bottomRight = getColorAt(sourceWidth - 1, sourceHeight - 1);
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

      for (let y = 0; y < sourceHeight; y++) {
        for (let x = 0; x < sourceWidth; x++) {
          const index = (y * sourceWidth + x) * 4;
          const alpha = data[index + 3];
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          if (alpha > 40 && colorDistance(red, green, blue, bgColor) > 35) {
            candidates.push({ x, y });
          }
        }
      }

      if (candidates.length < this.maxParticles) {
        candidates.length = 0;
        for (let y = 0; y < sourceHeight; y++) {
          for (let x = 0; x < sourceWidth; x++) {
            const index = (y * sourceWidth + x) * 4;
            if (data[index + 3] > 40) candidates.push({ x, y });
          }
        }
      }

      if (candidates.length === 0) return [];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i];
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const boxWidth = Math.max(1, maxX - minX);
      const boxHeight = Math.max(1, maxY - minY);

      const normalized = candidates.map((p) => ({
        nx: (p.x - minX) / boxWidth,
        ny: (p.y - minY) / boxHeight,
      }));

      // Reduce very large pools first, then run farthest-point sampling
      // to maximize spacing and avoid overlap.
      let pool = normalized;
      const maxPoolSize = 30000;
      if (pool.length > maxPoolSize) {
        const stride = Math.ceil(pool.length / maxPoolSize);
        const reduced = [];
        for (let i = 0; i < pool.length; i += stride) reduced.push(pool[i]);
        pool = reduced;
      }

      if (pool.length <= this.maxParticles) {
        const padded = [];
        for (let i = 0; i < this.maxParticles; i++) {
          padded.push(pool[i % pool.length]);
        }
        return padded;
      }

      const selected = [];
      const selectedMask = new Array(pool.length).fill(false);
      const minDistSq = new Array(pool.length).fill(Infinity);

      selected.push(pool[0]);
      selectedMask[0] = true;

      while (
        selected.length < this.maxParticles &&
        selected.length < pool.length
      ) {
        const last = selected[selected.length - 1];

        for (let i = 0; i < pool.length; i++) {
          if (selectedMask[i]) continue;
          const dx = pool[i].nx - last.nx;
          const dy = pool[i].ny - last.ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < minDistSq[i]) minDistSq[i] = d2;
        }

        let bestIndex = -1;
        let bestScore = -1;
        for (let i = 0; i < pool.length; i++) {
          if (selectedMask[i]) continue;
          if (minDistSq[i] > bestScore) {
            bestScore = minDistSq[i];
            bestIndex = i;
          }
        }

        if (bestIndex === -1) break;
        selectedMask[bestIndex] = true;
        selected.push(pool[bestIndex]);
      }

      // Safety fill to keep fixed count deterministic.
      if (selected.length < this.maxParticles) {
        const step = pool.length / (this.maxParticles - selected.length);
        for (let i = 0; selected.length < this.maxParticles; i++) {
          selected.push(pool[Math.floor((i * step) % pool.length)]);
        }
      }
      return selected;
    }

    init(context) {
      this.particleArray = [];
      if (this.normalizedShapePoints.length === 0) {
        context.clearRect(0, 0, this.width, this.height);
        console.log("[particles] generated: 0 | size: 0");
        return;
      }

      const count = this.maxParticles;
      const aspectRatio = this.renderWidth / Math.max(1, this.renderHeight);
      const cols = Math.max(1, Math.round(Math.sqrt(count * aspectRatio)));
      const rows = Math.max(1, Math.ceil(count / cols));
      const cellWidth = this.renderWidth / cols;
      const cellHeight = this.renderHeight / rows;
      const spacingReference = Math.min(cellWidth, cellHeight);
      const fittedSize = spacingReference * 0.46;
      this.particleSize = Math.max(
        this.minParticleSize,
        Math.min(this.baseParticleSize, fittedSize),
      );

      for (let i = 0; i < count; i++) {
        const p = this.normalizedShapePoints[i];
        const x = this.x + p.nx * (this.renderWidth - 1);
        const y = this.y + p.ny * (this.renderHeight - 1);
        this.particleArray.push(new Particle(this, x, y, this.particleSize, i));
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

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") event.preventDefault();
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
