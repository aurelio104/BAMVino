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

  // Aspect ratios por si los assets aún no cargan
  let videoAspect = 16 / 9; // fallback
  let logoAspect = 0.8;       // se calcula con naturalWidth/naturalHeight

  // UI inicial
  window.addEventListener("load", () => {
    if (loader) loader.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  });

  // iOS autoplay-safe: empezamos silenciado; si el usuario da “Iniciar”, habilitamos sonido
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    soundEnabled = true; // el usuario ya interactuó → podemos intentar con audio
    startBtn.style.display = "none";
    clickSound?.play?.().catch(() => {});
  });

  // Errores MindAR (permisos de cámara, etc.)
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // Leer metadatos para aspect del video (width/height reales)
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

  // Aspect del logo
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

  // Intentar reproducir video con/ sin sonido
  function intentarReproducirVideo() {
    if (!videoEl) return;
    // iOS: para que empiece seguro, primero muted=true; si el usuario ya tocó “Iniciar”, reintentamos con sonido
    videoEl.muted = !soundEnabled;
    videoEl.playsInline = true;

    const p = videoEl.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // Si falla con audio, mostramos overlay para que el usuario toque y reintentamos con audio
        if (sonidoOverlay) {
          sonidoOverlay.style.display = "block";
          sonidoOverlay.onclick = () => {
            sonidoOverlay.style.display = "none";
            videoEl.muted = false;
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {
              // Si sigue fallando, nos quedamos en modo silenciado
              videoEl.muted = true;
              videoEl.play().catch(() => {});
            });
          };
        }
      });
    }
  }

  // Construcción de targets
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    const target = document.createElement("a-entity");
    target.setAttribute("mindar-image-target", `targetIndex: ${i}`);

    let videoNode = null; // a-video
    let logoNode = null;  // a-plane para logo

    target.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;

      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      // Crear nodos una sola vez
      if (!videoNode) {
        // Tamaños base (en metros)
        const VIDEO_WIDTH = 3.0; // ajusta a gusto
        const VIDEO_HEIGHT = VIDEO_WIDTH / videoAspect;

        videoNode = document.createElement("a-video");
        videoNode.setAttribute("src", "#ar-video");
        videoNode.setAttribute("width", VIDEO_WIDTH.toString());
        videoNode.setAttribute("height", VIDEO_HEIGHT.toString());
        videoNode.setAttribute("position", `0 0 0.01`);
        videoNode.setAttribute("rotation", "0 0 0");
        videoNode.setAttribute("loop", "true");
        videoNode.setAttribute("visible", "false");
        // Animación pop-in
        videoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
        videoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
        videoNode.object3D.scale.set(0.98, 0.98, 0.98);

        target.appendChild(videoNode);

        // LOGO debajo del video
        const spacing = 0.15; // espacio entre video y logo
        const LOGO_WIDTH = VIDEO_WIDTH * 0.6; // logo algo más angosto que el video
        const LOGO_HEIGHT = LOGO_WIDTH / logoAspect;
        const logoY = - (VIDEO_HEIGHT / 2) - spacing - (LOGO_HEIGHT / 2);

        logoNode = document.createElement("a-plane");
        logoNode.setAttribute("material", "src: #logo-img; transparent: true; alphaTest: 0.01; side: double");
        logoNode.setAttribute("width", LOGO_WIDTH.toString());
        logoNode.setAttribute("height", LOGO_HEIGHT.toString());
        logoNode.setAttribute("position", `0 ${logoY} 0.01`);
        logoNode.setAttribute("rotation", "0 0 0");
        logoNode.setAttribute("visible", "false");
        // Entrada suave
        logoNode.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 200; easing: easeOutBack; startEvents: show");
        logoNode.setAttribute("animation__out", "property: scale; to: 0.98 0.98 0.98; dur: 140; easing: easeInQuad; startEvents: hide");
        logoNode.object3D.scale.set(0.98, 0.98, 0.98);

        target.appendChild(logoNode);

        // Si los assets cargan después, actualizamos tamaños
        videoEl?.addEventListener("loadedmetadata", () => {
          const newAspect = videoEl.videoWidth && videoEl.videoHeight
            ? videoEl.videoWidth / videoEl.videoHeight
            : videoAspect;
          const newH = VIDEO_WIDTH / newAspect;
          videoNode.setAttribute("height", newH.toString());

          const newLogoH = (LOGO_WIDTH / (logoAspect || 1));
          const newLogoY = - (newH / 2) - spacing - (newLogoH / 2);
          logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
        });

        logoImg?.addEventListener("load", () => {
          const aspect = logoImg.naturalWidth && logoImg.naturalHeight
            ? logoImg.naturalWidth / logoImg.naturalHeight
            : logoAspect;
          const newLogoH = LOGO_WIDTH / aspect;
          logoNode.setAttribute("height", newLogoH.toString());

          const vH = parseFloat(videoNode.getAttribute("height"));
          const newLogoY = - (vH / 2) - spacing - (newLogoH / 2);
          logoNode.setAttribute("position", `0 ${newLogoY} 0.01`);
        });
      }

      // Mostrar y reproducir
      videoNode.setAttribute("visible", "true");
      logoNode.setAttribute("visible", "true");
      videoNode.emit("show");
      logoNode.emit("show");

      // Reiniciar (opcional) y reproducir
      videoEl.currentTime = 0;
      intentarReproducirVideo();
    });

    target.addEventListener("targetLost", () => {
      if (markerInfo) markerInfo.innerText = `Marcador: ---`;
      // Ocultar y pausar
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
        videoEl.currentTime = 0;
      }
    });

    scene.appendChild(target);
  }
});
