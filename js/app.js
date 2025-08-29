/* ------- Suavizado con “snap inicial” para que SIEMPRE se vea de inmediato ------- */
AFRAME.registerComponent('smooth-follow', {
  schema: { source: {type:'selector'}, pos:{default:0.22}, rot:{default:0.30}, scl:{default:0.22} },
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

    // Primer frame tras targetFound: “snap” (sin inercia) para garantizar visibilidad inmediata
    if (!this._snapped && src.object3D.visible) {
      const o = this.el.object3D;
      o.position.copy(this._pos);
      o.quaternion.copy(this._quat);
      o.scale.copy(this._scl);
      this._curScl.copy(this._scl);
      this._snapped = true;
      return;
    }

    // Luego, lerp / slerp para suavizar jitter
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

  const videoEl = document.getElementById("ar-video");
  const logoImg = document.getElementById("logo-img");
  const anchor = document.getElementById("anchor-0");

  let experienciaIniciada = false;
  let soundEnabled = false;

  let videoAspect = 16 / 9;
  let logoAspect = 1;

  // UI
  window.addEventListener("load", () => {
    loader.style.display = "none";
    startBtn.style.display = "block";
  });

  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    soundEnabled = true;
    startBtn.style.display = "none";
    clickSound?.play?.().catch(()=>{});
  });

  // Errores MindAR
  scene.addEventListener("arError", () => camError.style.display = "block");

  // Aspectos reales
  videoEl?.addEventListener("loadedmetadata", () => {
    if (videoEl.videoWidth && videoEl.videoHeight) {
      videoAspect = videoEl.videoWidth / videoEl.videoHeight;
      console.log("[video] aspect:", videoAspect);
    }
  });
  videoEl?.addEventListener("error", (e)=> console.warn("[video] error", e));
  if (logoImg?.complete && logoImg.naturalWidth) {
    logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
  } else {
    logoImg.onload = ()=> {
      logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
      console.log("[logo] aspect:", logoAspect);
    };
  }

  // iOS autoplay-safe
  function intentarReproducirVideo() {
    if (!videoEl) return;
    videoEl.muted = !soundEnabled;     // primero muted si no hubo gesto
    videoEl.playsInline = true;

    const p = videoEl.play();
    if (p && p.catch) {
      p.catch((err) => {
        console.warn("[video] play blocked, mostrando overlay.", err);
        if (sonidoOverlay) {
          sonidoOverlay.style.display = "block";
          sonidoOverlay.onclick = () => {
            sonidoOverlay.style.display = "none";
            videoEl.muted = false;
            videoEl.currentTime = 0;
            videoEl.play().catch((e)=>{
              console.warn("[video] sigue bloqueado con audio, reproduzco en mute.", e);
              videoEl.muted = true;
              videoEl.play().catch(() => {});
            });
          };
        }
      });
    }
  }

  // === Contenedor “content” desacoplado que sigue con suavizado ===
  const content = document.createElement("a-entity");
  content.setAttribute("smooth-follow", "source: #anchor-0; pos: 0.22; rot: 0.30; scl: 0.22");
  content.setAttribute("visible", "false");
  scene.appendChild(content);

  // Nodos del contenido
  let videoNode = null;
  let logoNode  = null;

  function ensureNodes() {
    if (videoNode) return;

    const VIDEO_WIDTH = 3.0;
    const VIDEO_HEIGHT = VIDEO_WIDTH / videoAspect;

    videoNode = document.createElement("a-video");
    videoNode.setAttribute("src", "#ar-video");
    videoNode.setAttribute("width", VIDEO_WIDTH.toString());
    videoNode.setAttribute("height", VIDEO_HEIGHT.toString());
    videoNode.setAttribute("position", "0 0 0.02"); // un pelín más arriba para evitar z-fight
    videoNode.setAttribute("rotation", "0 0 0");
    videoNode.setAttribute("loop", "true");
    videoNode.setAttribute("visible", "false");
    videoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
    videoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
    videoNode.object3D.scale.set(0.98, 0.98, 0.98);
    content.appendChild(videoNode);

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

    // Ajustes en caliente si cambian aspectos
    videoEl?.addEventListener("loadedmetadata", () => {
      const aspect = (videoEl.videoWidth && videoEl.videoHeight) ? videoEl.videoWidth / videoEl.videoHeight : videoAspect;
      const newH = VIDEO_WIDTH / aspect;
      videoNode.setAttribute("height", newH.toString());

      const newLogoH = LOGO_WIDTH / (logoAspect || 1);
      const newLogoY = - (newH / 2) - spacing - (newLogoH / 2);
      logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
    });

    logoImg?.addEventListener("load", () => {
      const aspect = (logoImg.naturalWidth && logoImg.naturalHeight) ? logoImg.naturalWidth / logoImg.naturalHeight : logoAspect;
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

    console.log("✅ targetFound");
    markerInfo.innerText = "Marcador: 0";

    ensureNodes();

    // Snap inmediato: forzamos el primer encaje (luego el componente suaviza)
    content.components['smooth-follow']?.resetSnap?.();

    content.setAttribute("visible", "true");
    videoNode.setAttribute("visible", "true");
    logoNode.setAttribute("visible", "true");
    videoNode.emit("show");
    logoNode.emit("show");

    // Repro
    // videoEl.currentTime = 0; // quita esta línea si prefieres reanudar
    intentarReproducirVideo();
  });

  anchor.addEventListener("targetLost", () => {
    console.log("ℹ️ targetLost");
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
    // videoEl.currentTime = 0;  // comenta si prefieres reanudar al volver

    content.setAttribute("visible", "false");
    // Reseteamos el “snap” para la próxima detección
    content.components['smooth-follow']?.resetSnap?.();
  });
});
