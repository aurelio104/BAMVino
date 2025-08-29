document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const imgAsset = document.getElementById("ar-img");

  const TOTAL_MARCADORES = 1;

  let experienciaIniciada = false;
  let arAspect = 1; // width/height del PNG (se calcula al cargar)

  // ==== UI inicial
  window.addEventListener("load", () => {
    if (loader) loader.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  });

  // ==== Aspect ratio del PNG
  function computeAspect() {
    const w = imgAsset?.naturalWidth || 1;
    const h = imgAsset?.naturalHeight || 1;
    arAspect = w / h;
  }
  if (imgAsset?.complete) computeAspect();
  else if (imgAsset) imgAsset.onload = computeAspect;

  // ==== Error real de MindAR
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // ==== Start
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    startBtn.style.display = "none";
    if (clickSound) clickSound.play().catch(() => {});
  });

  // ==== Rig de “congelado” (seguidor de cámara)
  const cameraEl = scene.querySelector("a-camera");
  const freezeRig = document.createElement("a-entity");
  freezeRig.setAttribute("id", "freeze-rig");
  if (cameraEl) cameraEl.appendChild(freezeRig);

  // Estado para pinch zoom cuando está congelado
  let activeFrozenPlane = null;
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  // Gestos para zoom (solo en modo congelado)
  function distance2D(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  window.addEventListener("touchstart", (e) => {
    if (!activeFrozenPlane) return;
    if (e.touches.length === 2) {
      pinchStartDist = distance2D(e.touches[0], e.touches[1]);
      // escala actual (usar X)
      pinchStartScale = activeFrozenPlane.object3D.scale.x;
    }
  }, {passive: true});

  window.addEventListener("touchmove", (e) => {
    if (!activeFrozenPlane) return;
    if (e.touches.length === 2 && pinchStartDist > 0) {
      const d = distance2D(e.touches[0], e.touches[1]);
      const ratio = d / pinchStartDist;
      const newS = Math.min(Math.max(pinchStartScale * ratio, 0.3), 5); // límites
      activeFrozenPlane.object3D.scale.set(newS, newS, newS);
    }
  }, {passive: true});

  window.addEventListener("touchend", () => {
    // nada especial; el tamaño queda donde el usuario lo dejó
  });

  // ==== Crear targets
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    const target = document.createElement("a-entity");
    target.setAttribute("mindar-image-target", `targetIndex: ${i}`);

    let plane = null;
    let frozen = false;

    // Congelar (mover el plano al rig de cámara, visible y escalable)
    function freezePlane() {
      if (!plane || frozen) return;
      frozen = true;

      // reparent al rig de cámara y colócalo delante
      freezeRig.appendChild(plane);
      plane.setAttribute("visible", "true");
      plane.setAttribute("position", "0 0 -0.6"); // ~60cm delante de cámara
      plane.setAttribute("rotation", "0 0 0");
      // escala base = 1 (el usuario puede pinchar para zoom)
      plane.object3D.scale.set(1, 1, 1);

      activeFrozenPlane = plane; // habilita pinch zoom
      if (markerInfo) markerInfo.innerText = `Marcador: --- (congelado)`;
    }

    // Descongelar (volver a trackear sobre el target)
    function unfreezePlane() {
      if (!plane || !frozen) return;
      frozen = false;

      target.appendChild(plane);
      // Reset a su pose sobre el marcador
      plane.setAttribute("position", "0 0 0.01");
      plane.setAttribute("rotation", "0 0 0");
      plane.object3D.scale.set(0.96, 0.96, 0.96); // para pop-in
      activeFrozenPlane = null;
    }

    target.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;

      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      // Si veníamos congelados, volvemos a acoplar
      unfreezePlane();

      if (!plane) {
        plane = document.createElement("a-plane");

        // Tamaño base (ancho en metros); alto respeta aspect-ratio
        const width = 6.0;
        const height = width / arAspect;

        plane.setAttribute("width", width.toString());
        plane.setAttribute("height", height.toString());
        plane.setAttribute("position", "0 0 0.01"); // evita z-fighting
        plane.setAttribute("rotation", "0 0 0");

        // 🔆 Material iluminado (letras más brillantes)
        plane.setAttribute(
          "material",
          "shader: standard; src: #ar-img; transparent: true; alphaTest: 0.01; side: double; metalness: 0; roughness: 1; emissive: #ffffff; emissiveIntensity: 0.7"
        );

        plane.setAttribute("shadow", "cast: true; receive: false");

        // Animación pop-in
        plane.setAttribute("visible", "false");
        plane.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
        plane.setAttribute("animation__out", "property: scale; to: 0.96 0.96 0.96; dur: 160; easing: easeInQuad; startEvents: hide");
        plane.object3D.scale.set(0.96, 0.96, 0.96);

        target.appendChild(plane);
      }

      plane.setAttribute("visible", "true");
      plane.emit("show");
    });

    target.addEventListener("targetLost", () => {
      // En lugar de ocultar, congelamos para leer
      freezePlane();
    });

    scene.appendChild(target);
  }
});
