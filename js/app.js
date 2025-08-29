document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const sonidoOverlay = document.getElementById("reactivar-sonido"); // no se usa con PNG
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const imgAsset = document.getElementById("ar-img");

  const TOTAL_MARCADORES = 1;

  let experienciaIniciada = false;
  let arAspect = 1; // width/height del PNG (se calcula al cargar)

  // Mostrar botón iniciar al cargar
  window.addEventListener("load", () => {
    if (loader) loader.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  });

  // Calcular aspect-ratio del PNG para no deformarlo
  function computeAspect() {
    const w = imgAsset?.naturalWidth || 1;
    const h = imgAsset?.naturalHeight || 1;
    arAspect = w / h;
  }
  if (imgAsset?.complete) computeAspect();
  else if (imgAsset) imgAsset.onload = computeAspect;

  // Eventos MindAR para mostrar error real de cámara (sin cambiar tu flujo)
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // Al presionar "Iniciar experiencia"
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    startBtn.style.display = "none";
    if (clickSound) clickSound.play().catch(() => {});
  });

  // Crear targets (0..TOTAL_MARCADORES-1) que muestran el PNG
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    const target = document.createElement("a-entity");
    target.setAttribute("mindar-image-target", `targetIndex: ${i}`);

    let plane = null;

    target.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;

      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      if (!plane) {
        plane = document.createElement("a-plane");

        // Tamaño: ajusta el ancho a tu gusto; alto mantiene el aspecto del PNG
        const width = 4.0;                // en metros sobre el marcador
        const height = width / arAspect;  // respeta aspect-ratio

        plane.setAttribute("width", width.toString());
        plane.setAttribute("height", height.toString());
        plane.setAttribute("position", "0 0 0.01"); // evita z-fighting
        plane.setAttribute("rotation", "0 0 0");

        // 🔆 Material iluminado (más brillo en letras)
        plane.setAttribute(
          "material",
          "shader: standard; src: #ar-img; transparent: true; alphaTest: 0.01; side: double; metalness: 0; roughness: 1; emissive: #ffffff; emissiveIntensity: 0.7"
        );

        plane.setAttribute("shadow", "cast: true; receive: false");

        // Animación suave (pop-in)
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
      if (markerInfo) markerInfo.innerText = `Marcador: ---`;
      if (plane) {
        plane.emit("hide");
        setTimeout(() => plane && plane.setAttribute("visible", "false"), 140);
      }
    });

    scene.appendChild(target);
  }
});
