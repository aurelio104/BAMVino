/* ------- Suavizado con “snap” + billboard para mantenerlo de frente ------- */
AFRAME.registerComponent('smooth-follow', {
  schema: {
    source: { type: 'selector' }, // #anchor-0
    pos: { default: 0.22 },       // suavizado posición (0..1)
    rot: { default: 0.30 },       // suavizado rotación (0..1)
    scl: { default: 0.22 },       // suavizado escala   (0..1)
    faceCamera: { default: true },// billboard: mirar a la cámara
    lockRoll: { default: true }   // ignorar “roll” (estabiliza el horizonte)
  },
  init() {
    this._m = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scl = new THREE.Vector3(1,1,1);
    this._curScl = new THREE.Vector3(1,1,1);

    this._snapDone = false;

    // para billboard
    this._camPos = new THREE.Vector3();
    this._desiredQuat = new THREE.Quaternion();
    this._tmpObj = new THREE.Object3D();
    this._euler = new THREE.Euler(0,0,0,'YXZ');
  },
  tick(t, dt) {
    const src = this.data.source; if (!src) return;
    const scene = this.el.sceneEl;
    const cam = scene && scene.camera;

    // Tomamos pose del anchor (solo posición y scale si faceCamera)
    src.object3D.updateWorldMatrix(true, false);
    this._m.copy(src.object3D.matrixWorld).decompose(this._pos, this._quat, this._scl);

    // Primer frame tras targetFound: “snap” (sin inercia) → garantía de que se vea al instante
    if (!this._snapDone && src.object3D.visible) {
      const o = this.el.object3D;
      o.position.copy(this._pos);
      o.scale.copy(this._scl);

      if (this.data.faceCamera && cam) {
        // billboard: mirar a la cámara (sin roll)
        cam.getWorldPosition(this._camPos);
        this._tmpObj.position.copy(o.position);
        this._tmpObj.lookAt(this._camPos);
        // lock roll
        if (this.data.lockRoll) {
          this._tmpObj.getWorldQuaternion(this._desiredQuat);
          this._euler.setFromQuaternion(this._desiredQuat);
          this._euler.z = 0; // quita roll
          this._desiredQuat.setFromEuler(this._euler);
          o.quaternion.copy(this._desiredQuat);
        } else {
          o.lookAt(this._camPos);
        }
      } else {
        // sin billboard: hereda rotación del marker
        o.quaternion.copy(this._quat);
      }

      this._curScl.copy(this._scl);
      this._snapDone = true;
      return;
    }

    // Suavizado frame-rate independent
    const base = Math.max(dt, 16.666);
    const kPos = 1 - Math.pow(1 - this.data.pos, base / 16.666);
    const kRot = 1 - Math.pow(1 - this.data.rot, base / 16.666);
    const kScl = 1 - Math.pow(1 - this.data.scl, base / 16.666);

    const o = this.el.object3D;

    // Posición y escala suavizadas desde el anchor
    o.position.lerp(this._pos, kPos);
    this._curScl.lerp(this._scl, kScl);
    o.scale.copy(this._curScl);

    // Rotación: billboard (mirar cámara) o heredar marker suavizado
    if (this.data.faceCamera && cam) {
      cam.getWorldPosition(this._camPos);
      // Calculamos orientación deseada que mira a cámara
      this._tmpObj.position.copy(o.position);
      this._tmpObj.lookAt(this._camPos);
      if (this.data.lockRoll) {
        this._tmpObj.getWorldQuaternion(this._desiredQuat);
        this._euler.setFromQuaternion(this._desiredQuat);
        this._euler.z = 0; // quita roll
        this._desiredQuat.setFromEuler(this._euler);
      } else {
        this._desiredQuat.copy(this._tmpObj.quaternion);
      }
      o.quaternion.slerp(this._desiredQuat, kRot);
    } else {
      // hereda rotación del marker
      o.quaternion.slerp(this._quat, kRot);
    }
  },
  resetSnap() { this._snapDone = false; }
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
  const anchor = document.getElementById("anchor-0");

  let experienciaIniciada = false;
  let soundEnabled = false;

  // Aspect ratios fallback
  let videoAspect = 16 / 9;
  let logoAspect = 1;

  // UI inicial
  window.addEventListener("load", () => {
    if (loader) loader.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  });

  // iOS autoplay-safe
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    soundEnabled = true;
    startBtn.style.display = "none";
    clickSound?.play?.().catch(() => {});
  });

  // Errores MindAR
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // Aspect del video/ logo reales
  videoEl?.addEventListener("loadedmetadata", () => {
    if (videoEl.videoWidth && videoEl.videoHeight) {
      videoAspect = videoEl.videoWidth / videoEl.videoHeight;
    }
  });
  if (logoImg?.complete && logoImg.naturalWidth) {
    logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
  } else {
    logoImg.onload = () => {
      logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
    };
  }

  // Intentar reproducir video con/ sin sonido
  function intentarReproducirVideo() {
    if (!videoEl) return;
    videoEl.muted = !soundEnabled; // primero en mute si no hubo gesto
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

  // ===== Contenedor “content” con billboard + suavizado =====
  const content = document.createElement("a-entity");
  content.setAttribute(
    "smooth-follow",
    "source: #anchor-0; pos: 0.22; rot: 0.30; scl: 0.22; faceCamera: true; lockRoll: true"
  );
  content.setAttribute("visible", "false");
  scene.appendChild(content);

  // Nodos del contenido
  let videoNode = null;
  let logoNode  = null;

  function ensureNodes() {
    if (videoNode) return;

    const VIDEO_WIDTH = 3.0;                 // en metros
    const VIDEO_HEIGHT = VIDEO_WIDTH / videoAspect;

    // Video (encima)
    videoNode = document.createElement("a-video");
    videoNode.setAttribute("src", "#ar-video");
    videoNode.setAttribute("width", VIDEO_WIDTH.toString());
    videoNode.setAttribute("height", VIDEO_HEIGHT.toString());
    videoNode.setAttribute("position", "0 0 0.02"); // un poco delante para evitar z-fight
    videoNode.setAttribute("rotation", "0 0 0");
    videoNode.setAttribute("loop", "true");
    videoNode.setAttribute("visible", "false");
    videoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
    videoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
    videoNode.object3D.scale.set(0.98, 0.98, 0.98);
    content.appendChild(videoNode);

    // Logo (debajo)
    const spacing = 0.15;
    const LOGO_WIDTH = VIDEO_WIDTH * 0.6;
    const LOGO_HEIGHT = LOGO_WIDTH / (logoAspect || 1);
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

    // Reajustes si cambian aspectos
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

  // Eventos del anchor
  anchor.addEventListener("targetFound", () => {
    if (!experienciaIniciada) return;

    markerInfo.innerText = "Marcador: 0";
    ensureNodes();

    // Snap inmediato (y luego suaviza)
    content.components['smooth-follow']?.resetSnap?.();

    content.setAttribute("visible", "true");
    videoNode.setAttribute("visible", "true");
    logoNode.setAttribute("visible", "true");
    videoNode.emit("show");
    logoNode.emit("show");

    // videoEl.currentTime = 0; // quita esta línea si prefieres reanudar en targetFound
    intentarReproducirVideo();
  });

  anchor.addEventListener("targetLost", () => {
    markerInfo.innerText = "Marcador: ---";

    if (videoNode) {
      videoNode.emit("hide");
      setTimeout(() => videoNode && videoNode.setAttribute("visible", "false"), 120);
    }
    if (logoNode) {
      logoNode.emit("hide");
      setTimeout(() => logoNode && logoNode.setAttribute("visible", "false"), 120);
    }
    videoEl?.pause();
    // videoEl.currentTime = 0; // comenta si quieres reanudar al volver

    content.setAttribute("visible", "false");
    content.components['smooth-follow']?.resetSnap?.();
  });
});
