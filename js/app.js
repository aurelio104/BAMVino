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

  // Aspect reales
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

  // ===== Contenido ANCLADO al marcador (hijo directo del anchor) =====
  // SIN "smooth-follow": hereda la pose EXACTA del marcador (máxima alineación).
  let content = null;
  let videoNode = null; // cilindro curvo
  let logoNode  = null; // logo plano debajo

  // Parámetros del vídeo CURVO sobre botella (ajusta a tu caso)
  const ARC_DEG      = 100;    // arco visible del contenido (80–120)
  const ARC_LENGTH   = 2.0;    // “ancho” del contenido a lo largo del arco, en tus unidades (si antes width=2.0/3.0)
  const THETA_RAD    = ARC_DEG * Math.PI / 180;
  let   bottleRadius = (ARC_LENGTH / THETA_RAD); // r = s / θ(rad)

  function ensureNodes() {
    if (content) return;

    // 1) contenedor centrado en el origen del marker (anclado 1:1)
    content = document.createElement("a-entity");
    content.setAttribute("id", "content-0");
    content.setAttribute("position", "0 0 0");
    content.setAttribute("rotation", "0 0 0");
    content.setAttribute("scale", "1 1 1");
    anchor.appendChild(content);

    // 2) altura del cilindro según aspect del video:
    // ancho del video sobre la etiqueta = ARC_LENGTH → height = ARC_LENGTH / aspect
    let cylHeight = ARC_LENGTH / videoAspect;

    // === Video curvo (cilindro abierto), CENTRADO y mirando al +Z del marker ===
    videoNode = document.createElement("a-entity");
    videoNode.setAttribute(
      "geometry",
      `primitive: cylinder; radius: ${bottleRadius}; height: ${cylHeight}; thetaLength: ${ARC_DEG}; thetaStart: ${-ARC_DEG/2}; openEnded: true`
    );
    videoNode.setAttribute("material", "src: #ar-video; side: double; transparent: true");
    // MUY IMPORTANTE: rotación Y=90° para que el arco quede centrado hacia +Z (frente del marker)
    videoNode.setAttribute("rotation", "0 90 0");
    // z mínimo para evitar z-fight con el plano del marker
    videoNode.setAttribute("position", "0 0 0.004");
    videoNode.setAttribute("visible", "false");
    content.appendChild(videoNode);

    // === Logo debajo del contenido (plano, centrado) ===
    const spacing   = 0.12;
    const LOGO_ARC  = ARC_LENGTH * 0.6;     // logo más angosto
    const logoW     = LOGO_ARC;
    const logoH     = logoW / (logoAspect || 1);
    const logoY     = - (cylHeight / 2) - spacing - (logoH / 2);

    logoNode = document.createElement("a-plane");
    logoNode.setAttribute("material", "src: #logo-img; transparent: true; alphaTest: 0.01; side: double");
    logoNode.setAttribute("width", logoW.toString());
    logoNode.setAttribute("height", logoH.toString());
    logoNode.setAttribute("position", `0 ${logoY} 0.006`); // un poco por delante del cilindro
    logoNode.setAttribute("rotation", "0 0 0");
    logoNode.setAttribute("visible", "false");
    content.appendChild(logoNode);

    // Ajustes en caliente cuando tengamos aspect reales
    videoEl?.addEventListener("loadedmetadata", () => {
      if (!(videoEl.videoWidth && videoEl.videoHeight)) return;
      const aspect = videoEl.videoWidth / videoEl.videoHeight;
      const newH   = ARC_LENGTH / aspect;

      videoNode.setAttribute(
        "geometry",
        `primitive: cylinder; radius: ${bottleRadius}; height: ${newH}; thetaLength: ${ARC_DEG}; thetaStart: ${-ARC_DEG/2}; openEnded: true`
      );

      const newLogoH = (LOGO_ARC / (logoAspect || 1));
      const newLogoY = - (newH / 2) - spacing - (newLogoH / 2);
      logoNode.setAttribute("height", newLogoH.toString());
      logoNode.setAttribute("position", `0 ${newLogoY} 0.006`);
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
      logoNode.setAttribute("position", `0 ${newLogoY} 0.006`);
    });
  }

  // Eventos del anchor
  anchor.addEventListener("targetFound", () => {
    if (!experienciaIniciada) return;

    markerInfo.innerText = "Marcador: 0";
    ensureNodes();

    // Mostrar
    content.setAttribute("visible", "true");
    videoNode.setAttribute("visible", "true");
    logoNode.setAttribute("visible", "true");

    // Reproducir
    // videoEl.currentTime = 0; // quita si prefieres reanudar
    intentarReproducirVideo();
  });

  anchor.addEventListener("targetLost", () => {
    markerInfo.innerText = "Marcador: ---";

    videoNode?.setAttribute("visible", "false");
    logoNode?.setAttribute("visible", "false");
    content?.setAttribute("visible", "false");

    videoEl?.pause();
    // videoEl.currentTime = 0; // comenta si quieres reanudar al volver
  });
});
