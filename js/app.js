/* ====== Suavizado que SIGUE exactamente la rotación del marcador (sin billboard) ====== */
AFRAME.registerComponent('smooth-follow', {
  schema: {
    source: { type: 'selector' }, // p.ej. #anchor-0
    pos:   { default: 0.25 },     // suavizado posición (0..1)
    rot:   { default: 0.35 },     // suavizado rotación (0..1)
    scl:   { default: 0.25 }      // suavizado escala   (0..1)
  },
  init() {
    this._m = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scl = new THREE.Vector3(1,1,1);
    this._curScl = new THREE.Vector3(1,1,1);
    this._snapped = false;
  },
  tick(t, dt) {
    const src = this.data.source; if (!src) return;

    // Pose world del anchor
    src.object3D.updateWorldMatrix(true, false);
    this._m.copy(src.object3D.matrixWorld).decompose(this._pos, this._quat, this._scl);

    // Snap inicial (garantiza visibilidad instantánea)
    if (!this._snapped && src.object3D.visible) {
      const o = this.el.object3D;
      o.position.copy(this._pos);
      o.quaternion.copy(this._quat);
      o.scale.copy(this._scl);
      this._curScl.copy(this._scl);
      this._snapped = true;
      return;
    }

    // Suavizado frame-rate independent
    const base = Math.max(dt, 16.666);
    const kPos = 1 - Math.pow(1 - this.data.pos, base / 16.666);
    const kRot = 1 - Math.pow(1 - this.data.rot, base / 16.666);
    const kScl = 1 - Math.pow(1 - this.data.scl, base / 16.666);

    const o = this.el.object3D;
    o.position.lerp(this._pos, kPos);
    o.quaternion.slerp(this._quat, kRot);
    this._curScl.lerp(this._scl, kScl);
    o.scale.copy(this._curScl);
  },
  resetSnap() { this._snapped = false; }
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
  let logoAspect  = 1;

  // === UI inicial
  window.addEventListener("load", () => {
    loader.style.display = "none";
    startBtn.style.display = "block";
  });

  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    soundEnabled = true;
    startBtn.style.display = "none";
    clickSound?.play?.().catch(() => {});
  });

  // Errores MindAR
  scene.addEventListener("arError", () => {
    camError.style.display = "block";
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

  // iOS autoplay-safe
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

  // ===== Contenedor que SIGUE al anchor con suavizado (rotación idéntica) =====
  const content = document.createElement("a-entity");
  content.setAttribute("smooth-follow", "source: #anchor-0; pos: 0.25; rot: 0.35; scl: 0.25");
  content.setAttribute("visible", "false");
  scene.appendChild(content);

  // Nodos del contenido
  let videoNode = null; // cilindro curvo
  let logoNode  = null; // logo plano debajo

  // ===== Parámetros del vídeo CURVO sobre botella =====
  // Elegimos el ARCO visible del video (en grados) y su LONGITUD (en "unidades A-Frame").
  // NOTA: estas "unidades" deben ser consistentes con lo que venías usando (antes width=2.0/3.0).
  const ARC_DEG      = 100;     // arco visible (p.ej. 80–120)
  const ARC_LENGTH   = 2.0;     // "ancho" del contenido a lo largo del arco, en tus unidades de escena
  // Con eso el radio se calcula como: r = s / theta(rad)
  const THETA_RAD    = ARC_DEG * Math.PI / 180;
  let   bottleRadius = (ARC_LENGTH / THETA_RAD); // radio consistente con tu escala de escena

  function ensureNodes() {
    if (videoNode) return;

    // Altura del cilindro según aspect del video:
    // ancho del video sobre la etiqueta = ARC_LENGTH → height = ARC_LENGTH / aspect
    let cylHeight = ARC_LENGTH / videoAspect;

    // === Video curvo (cilindro abierto) ===
    videoNode = document.createElement("a-entity");
    videoNode.setAttribute(
      "geometry",
      `primitive: cylinder; radius: ${bottleRadius}; height: ${cylHeight}; thetaLength: ${ARC_DEG}; thetaStart: ${-ARC_DEG/2}; openEnded: true`
    );
    videoNode.setAttribute(
      "material",
      "src: #ar-video; side: double; transparent: true"
    );
    videoNode.setAttribute("position", "0 0 0.02");  // un poco delante para evitar z-fight
    videoNode.setAttribute("rotation", "0 0 0");
    videoNode.setAttribute("visible", "false");
    videoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
    videoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
    videoNode.object3D.scale.set(0.98, 0.98, 0.98);
    content.appendChild(videoNode);

    // === Logo debajo (plano) ===
    const spacing   = 0.12;                // espacio entre video y logo
    const LOGO_ARC  = ARC_LENGTH * 0.6;    // logo algo más angosto que el video
    const logoWidth = LOGO_ARC;            // mantenemos misma escala (a lo largo del arco)
    const logoH     = logoWidth / (logoAspect || 1);
    const logoY     = - (cylHeight / 2) - spacing - (logoH / 2);

    logoNode = document.createElement("a-plane");
    logoNode.setAttribute("material", "src: #logo-img; transparent: true; alphaTest: 0.01; side: double");
    logoNode.setAttribute("width", logoWidth.toString());
    logoNode.setAttribute("height", logoH.toString());
    logoNode.setAttribute("position", `0 ${logoY} 0.01`);
    logoNode.setAttribute("rotation", "0 0 0");
    logoNode.setAttribute("visible", "false");
    logoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 200; easing: easeOutBack; startEvents: show");
    logoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
    logoNode.object3D.scale.set(0.98, 0.98, 0.98);
    content.appendChild(logoNode);

    // Recalcular altura del cilindro y posición del logo cuando tengamos aspect real
    videoEl?.addEventListener("loadedmetadata", () => {
      if (!(videoEl.videoWidth && videoEl.videoHeight)) return;
      const aspect   = videoEl.videoWidth / videoEl.videoHeight;
      const newH     = ARC_LENGTH / aspect;
      videoNode.setAttribute(
        "geometry",
        `primitive: cylinder; radius: ${bottleRadius}; height: ${newH}; thetaLength: ${ARC_DEG}; thetaStart: ${-ARC_DEG/2}; openEnded: true`
      );

      const newLogoH = (LOGO_ARC / (logoAspect || 1));
      const newLogoY = - (newH / 2) - spacing - (newLogoH / 2);
      logoNode.setAttribute("height", newLogoH.toString());
      logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
    });

    logoImg?.addEventListener("load", () => {
      const aspect = (logoImg.naturalWidth && logoImg.naturalHeight)
        ? logoImg.naturalWidth / logoImg.naturalHeight
        : logoAspect;
      const newLogoH = (LOGO_ARC / aspect);
      logoNode.setAttribute("height", newLogoH.toString());

      const curGeom = videoNode.getAttribute("geometry");
      const vH = curGeom && curGeom.height ? parseFloat(curGeom.height) : (ARC_LENGTH / videoAspect);
      const newLogoY = - (vH / 2) - spacing - (newLogoH / 2);
      logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
    });
  }

  // Eventos del anchor
  anchor.addEventListener("targetFound", () => {
    if (!experienciaIniciada) return;

    markerInfo.innerText = "Marcador: 0";
    ensureNodes();

    // Snap inmediato en la próxima tick
    content.components['smooth-follow']?.resetSnap?.();

    content.setAttribute("visible", "true");
    videoNode.setAttribute("visible", "true");
    logoNode.setAttribute("visible", "true");
    videoNode.emit("show");
    logoNode.emit("show");

    // videoEl.currentTime = 0; // quítalo si prefieres reanudar
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
