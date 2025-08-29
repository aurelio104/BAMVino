/* --------- Suavizado extra: componente smooth-follow -------------------------
   Copia la pose world del anchor (mindar-image-target) y la interpola
   para reducir micro-jitter visible. Ajusta pos/rot/scl para más suavidad.
----------------------------------------------------------------------------- */
AFRAME.registerComponent('smooth-follow', {
  schema: {
    source: { type: 'selector' }, // p.ej. #anchor-0
    pos: { default: 0.18 },       // 0..1 (más alto = más suave = más retardo)
    rot: { default: 0.25 },
    scl: { default: 0.18 },
    visibleWithSource: { default: true }
  },
  init() {
    this.tPos = new THREE.Vector3();
    this.tQuat = new THREE.Quaternion();
    this.tScl = new THREE.Vector3(1,1,1);
    this.curScl = new THREE.Vector3(1,1,1);
    this.tmpM = new THREE.Matrix4();
  },
  tick(t, dt) {
    const src = this.data.source;
    if (!src) return;

    if (this.data.visibleWithSource) {
      this.el.object3D.visible = src.object3D.visible;
    }

    src.object3D.updateWorldMatrix(true, false);
    this.tmpM.copy(src.object3D.matrixWorld);
    this.tmpM.decompose(this.tPos, this.tQuat, this.tScl);

    // ganancias dependientes de dt (frame-rate independent)
    const base = Math.max(dt, 16.666);
    const kPos = 1 - Math.pow(1 - this.data.pos, base / 16.666);
    const kRot = 1 - Math.pow(1 - this.data.rot, base / 16.666);
    const kScl = 1 - Math.pow(1 - this.data.scl, base / 16.666);

    const o = this.el.object3D;
    o.position.lerp(this.tPos, kPos);
    o.quaternion.slerp(this.tQuat, kRot);
    this.curScl.lerp(this.tScl, kScl);
    o.scale.copy(this.curScl);
  }
});


document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const sonidoOverlay = document.getElementById("reactivar-sonido");

  // Assets
  const videoEl = document.getElementById("ar-video");
  const logoImg = document.getElementById("logo-img");

  const TOTAL_MARCADORES = 1;

  let experienciaIniciada = false;
  let soundEnabled = false;

  // Aspect ratios fallback
  let videoAspect = 16 / 9;
  let logoAspect = 0.8;

  // UI inicial
  window.addEventListener("load", () => {
    if (loader) loader.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  });

  // Start (gesto del usuario → desbloquea audio)
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    soundEnabled = true;
    startBtn.style.display = "none";
    clickSound?.play?.().catch(() => {});
  });

  // Error MindAR
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // Aspect del video real
  if (videoEl) {
    if (videoEl.readyState >= 1 && videoEl.videoWidth) {
      videoAspect = videoEl.videoWidth / videoEl.videoHeight;
    } else {
      videoEl.addEventListener("loadedmetadata", () => {
        if (videoEl.videoWidth && videoEl.videoHeight) {
          videoAspect = videoEl.videoWidth / videoEl.videoHeight;
        }
      });
    }
  }

  // Aspect del logo real
  if (logoImg) {
    if (logoImg.complete && logoImg.naturalWidth) {
      logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
    } else {
      logoImg.onload = () => {
        if (logoImg.naturalWidth && logoImg.naturalHeight) {
          logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
        }
      };
    }
  }

  // iOS autoplay-safe
  function intentarReproducirVideo() {
    if (!videoEl) return;
    videoEl.muted = !soundEnabled;
    videoEl.playsInline = true;

    const p = videoEl.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (sonidoOverlay) {
          sonidoOverlay.style.display = "block";
          sonidoOverlay.onclick = () => {
            sonidoOverlay.style.display = "none";
            videoEl.muted = false;
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {
              videoEl.muted = true;
              videoEl.play().catch(() => {});
            });
          };
        }
      });
    }
  }

  // ===== Construcción con suavizado: anchor + content (seguidor) =====
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    // 1) Anchor (tracker)
    const anchor = document.createElement("a-entity");
    anchor.setAttribute("id", `anchor-${i}`);
    anchor.setAttribute("mindar-image-target", `targetIndex: ${i}`);
    scene.appendChild(anchor);

    // 2) Content (seguirá al anchor con suavizado)
    const content = document.createElement("a-entity");
    content.setAttribute(
      "smooth-follow",
      `source: #anchor-${i}; pos: 0.18; rot: 0.25; scl: 0.18; visibleWithSource: true`
    );
    content.setAttribute("visible", "false");
    scene.appendChild(content);

    // 3) Nodos (video + logo) dentro de "content"
    let videoNode = null;
    let logoNode  = null;

    function ensureNodes() {
      if (videoNode) return;

      const VIDEO_WIDTH = 4.0;
      const VIDEO_HEIGHT = VIDEO_WIDTH / videoAspect;

      videoNode = document.createElement("a-video");
      videoNode.setAttribute("src", "#ar-video");
      videoNode.setAttribute("width", VIDEO_WIDTH.toString());
      videoNode.setAttribute("height", VIDEO_HEIGHT.toString());
      videoNode.setAttribute("position", `0 0 0.01`);
      videoNode.setAttribute("rotation", "0 0 0");
      videoNode.setAttribute("loop", "true");
      videoNode.setAttribute("visible", "false");
      videoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
      videoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
      videoNode.object3D.scale.set(0.98, 0.98, 0.98);
      content.appendChild(videoNode);

      // Logo debajo del video
      const spacing = 0.15;
      const LOGO_WIDTH = VIDEO_WIDTH * 0.6;
      const LOGO_HEIGHT = LOGO_WIDTH / logoAspect;
      const logoY = - (VIDEO_HEIGHT / 2) - spacing - (LOGO_HEIGHT / 2);

      logoNode = document.createElement("a-plane");
      logoNode.setAttribute("material", "src: #logo-img; transparent: true; alphaTest: 0.01; side: double");
      logoNode.setAttribute("width", LOGO_WIDTH.toString());
      logoNode.setAttribute("height", LOGO_HEIGHT.toString());
      logoNode.setAttribute("position", `0 ${logoY} 0.01`);
      logoNode.setAttribute("rotation", "0 0 0");
      logoNode.setAttribute("visible", "false");
      logoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 200; easing: easeOutBack; startEvents: show");
      logoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
      logoNode.object3D.scale.set(0.98, 0.98, 0.98);
      content.appendChild(logoNode);

      // Recalcular cuando tengamos tamaños reales
      videoEl?.addEventListener("loadedmetadata", () => {
        const aspect = (videoEl.videoWidth && videoEl.videoHeight)
          ? videoEl.videoWidth / videoEl.videoHeight
          : videoAspect;
        const newH = VIDEO_WIDTH / aspect;
        videoNode.setAttribute("height", newH.toString());

        const newLogoH = LOGO_WIDTH / (logoAspect || 1);
        const newLogoY = - (newH / 2) - spacing - (newLogoH / 2);
        logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
      });

      logoImg?.addEventListener("load", () => {
        const aspect = (logoImg.naturalWidth && logoImg.naturalHeight)
          ? logoImg.naturalWidth / logoImg.naturalHeight
          : logoAspect;
        const newLogoH = LOGO_WIDTH / aspect;
        logoNode.setAttribute("height", newLogoH.toString());

        const vH = parseFloat(videoNode.getAttribute("height"));
        const newLogoY = - (vH / 2) - spacing - (newLogoH / 2);
        logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
      });
    }

    // Eventos de tracking sobre el anchor
    anchor.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;

      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      ensureNodes();

      content.setAttribute("visible", "true");
      videoNode.setAttribute("visible", "true");
      logoNode.setAttribute("visible", "true");
      videoNode.emit("show");
      logoNode.emit("show");

      videoEl.currentTime = 0; // o quita esta línea para reanudar
      intentarReproducirVideo();
    });

    anchor.addEventListener("targetLost", () => {
      if (markerInfo) markerInfo.innerText = `Marcador: ---`;

      if (videoNode) {
        videoNode.emit("hide");
        setTimeout(() => videoNode && videoNode.setAttribute("visible", "false"), 120);
      }
      if (logoNode) {
        logoNode.emit("hide");
        setTimeout(() => logoNode && logoNode.setAttribute("visible", "false"), 120);
      }
      if (videoEl) {
        videoEl.pause();
        videoEl.currentTime = 0; // quítalo si prefieres reanudar
      }
      content.setAttribute("visible", "false");
    });
  }
});
