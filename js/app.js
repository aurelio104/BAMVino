document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const imgAsset = document.getElementById("ar-img");

  const TOTAL_MARCADORES = 1;

  // Config lectura
  const HOLD_MS = 10000;      // tiempo visible tras perder el marcador
  const READ_DIST = 0.9;      // distancia al centrar frente a cámara (m)
  const BASE_WIDTH = 5.0;     // ancho del PNG sobre el marcador (m)

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

  // Error MindAR
  scene.addEventListener("arError", () => { if (camError) camError.style.display = "block"; });

  // Iniciar experiencia
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    startBtn.style.display = "none";
    try { clickSound?.play?.(); } catch {}
  });

  // ====== Estado hold & gestos ======
  let hideTimeout = null;
  let readingMode = false;  // true durante el hold (centrado frente a cámara)
  let activePlane = null;   // a-plane visible
  let lastTouch = null;
  let pinchStartDist = 0;
  let scaleAtPinchStart = 1;

  function enableGestures(plane){
    if (activePlane === plane && readingMode) return;
    activePlane = plane;
    readingMode = true;
    window.addEventListener("touchstart", onTouchStart, {passive:false});
    window.addEventListener("touchmove", onTouchMove, {passive:false});
    window.addEventListener("touchend", onTouchEnd, {passive:false});
    window.addEventListener("touchcancel", onTouchEnd, {passive:false});
  }
  function disableGestures(){
    readingMode = false;
    activePlane = null;
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    lastTouch = null; pinchStartDist = 0;
  }
  function onTouchStart(evt){
    if (!readingMode || !activePlane) return;
    const t = evt.touches;
    if (t.length === 2){
      evt.preventDefault();
      pinchStartDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      scaleAtPinchStart = activePlane.object3D.scale.x || 1;
      lastTouch = null;
    } else if (t.length === 1){
      evt.preventDefault();
      lastTouch = { x: t[0].clientX, y: t[0].clientY };
    }
  }
  function onTouchMove(evt){
    if (!readingMode || !activePlane) return;
    const t = evt.touches;
    if (t.length === 2 && pinchStartDist > 0){
      evt.preventDefault();
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      let s = scaleAtPinchStart * (d / pinchStartDist);
      s = Math.max(0.3, Math.min(6.0, s)); // límites
      activePlane.object3D.scale.set(s, s, s);
    } else if (t.length === 1 && lastTouch){
      evt.preventDefault();
      const dx = t[0].clientX - lastTouch.x;
      const dy = t[0].clientY - lastTouch.y;
      lastTouch = { x: t[0].clientX, y: t[0].clientY };
      const k = 0.002 * (activePlane.object3D.scale.x || 1);
      activePlane.object3D.position.x += dx * k;
      activePlane.object3D.position.y += -dy * k;
    }
  }
  function onTouchEnd(evt){
    const len = evt.touches ? evt.touches.length : 0;
    if (len < 2) pinchStartDist = 0;
    if (len === 0) lastTouch = null;
  }

  // Centrar contenido frente a la cámara (una sola vez al entrar en lectura)
  function centerForReading(contentRoot){
    const cam = document.querySelector('a-entity[mindar-camera] a-camera') || document.querySelector('a-camera');
    if (!cam) return;
    const camObj = cam.object3D;
    camObj.updateWorldMatrix(true, false);

    // Posición de cámara y dirección de mirada
    const camPos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    camObj.getWorldPosition(camPos);
    camObj.getWorldDirection(dir); // apunta hacia -Z del mundo de la cam

    // Posición objetivo = delante de la cámara
    const targetPos = camPos.clone().add(dir.multiplyScalar(READ_DIST));
    const o = contentRoot.object3D;
    o.position.copy(targetPos);

    // Orientar para que mire a la cámara (billboard)
    o.lookAt(camPos);
  }

  // Crear targets (0..TOTAL_MARCADORES-1)
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    // Anchor de MindAR
    const anchor = document.createElement("a-entity");
    anchor.setAttribute("mindar-image-target", `targetIndex: ${i}`);
    scene.appendChild(anchor);

    // Contenedor independiente (así podemos mantenerlo sin anchor)
    const content = document.createElement("a-entity");
    content.setAttribute("visible", "false");
    scene.appendChild(content);

    let plane = null;

    anchor.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;
      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      // Cancelar modo lectura si estaba activo
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      disableGestures();

      // Si no existe el plano, créalo
      if (!plane) {
        plane = document.createElement("a-plane");

        // Tamaño
        const width = BASE_WIDTH;
        const height = width / arAspect;

        plane.setAttribute("width", width.toString());
        plane.setAttribute("height", height.toString());
        plane.setAttribute("position", "0 0 0.01");
        plane.setAttribute("rotation", "0 0 0");

        // Material iluminado (letras potentes)
        plane.setAttribute(
          "material",
          "shader: standard; src: #ar-img; transparent: true; alphaTest: 0.01; side: double; metalness: 0; roughness: 1; emissive: #ffffff; emissiveIntensity: 0.7"
        );
        plane.setAttribute("shadow", "cast: true; receive: false");

        // Animación
        plane.setAttribute("visible", "false");
        plane.setAttribute("animation__in", "property: scale; to: 1 1 1; dur: 220; easing: easeOutBack; startEvents: show");
        plane.setAttribute("animation__out", "property: scale; to: 0.96 0.96 0.96; dur: 160; easing: easeInQuad; startEvents: hide");
        plane.object3D.scale.set(0.96, 0.96, 0.96);

        content.appendChild(plane);
      }

      // Copiar la pose del anchor al content (pegado al marcador)
      anchor.object3D.updateWorldMatrix(true,false);
      content.object3D.matrix.copy(anchor.object3D.matrixWorld);
      content.object3D.matrix.decompose(content.object3D.position, content.object3D.quaternion, content.object3D.scale);

      content.setAttribute("visible", "true");
      plane.setAttribute("visible", "true");
      plane.emit("show");
    });

    anchor.addEventListener("targetLost", () => {
      if (markerInfo) markerInfo.innerText = `Marcador: ---`;
      if (!plane) return;

      // Entrar a modo lectura: centrar frente a cámara + activar gestos
      centerForReading(content);
      enableGestures(plane);

      // Pequeño pop-out y mantener visible
      plane.emit("hide");
      setTimeout(() => { plane.setAttribute("visible", "true"); }, 140);

      // Temporizador para ocultar si no vuelve el marcador
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        content.setAttribute("visible", "false");
        disableGestures();
        hideTimeout = null;
      }, HOLD_MS);
    });
  }
});
