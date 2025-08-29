document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const imgAsset = document.getElementById("ar-img");

  const TOTAL_MARCADORES = 1;

  // ⏱️ Tiempo mínimo visible tras perder marcador (ms)
  const HOLD_MS = 10000;

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

  // Eventos MindAR para mostrar error real de cámara
  scene.addEventListener("arError", () => {
    if (camError) camError.style.display = "block";
  });

  // Iniciar experiencia
  startBtn.addEventListener("click", () => {
    experienciaIniciada = true;
    startBtn.style.display = "none";
    if (clickSound) clickSound.play().catch(() => {});
  });

  // ====== Estado para hold + gestos ======
  let hideTimeout = null;
  let gestureEnabled = false;
  let activePlane = null;   // a-plane actual visible
  let baseScale = 1;        // escala actual del plano (para pinch)
  let pinchStartDist = 0;   // distancia inicial del pinch
  let scaleAtPinchStart = 1;
  let lastTouch = null;     // para pan a 1 dedo

  // Helpers gestos
  function getTouchInfo(evt) {
    const t = evt.touches;
    return { count: t.length, t };
  }
  function dist(t0, t1) {
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }
  function enableGestures(plane) {
    if (gestureEnabled) return;
    gestureEnabled = true;
    activePlane = plane;
    baseScale = plane.object3D.scale.x || 1;

    window.addEventListener("touchstart", onTouchStart, {passive:false});
    window.addEventListener("touchmove", onTouchMove, {passive:false});
    window.addEventListener("touchend", onTouchEnd, {passive:false});
    window.addEventListener("touchcancel", onTouchEnd, {passive:false});
  }
  function disableGestures() {
    if (!gestureEnabled) return;
    gestureEnabled = false;
    activePlane = null;
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
  }

  function onTouchStart(evt){
    if (!gestureEnabled || !activePlane) return;
    const { count, t } = getTouchInfo(evt);
    if (count === 2) {
      evt.preventDefault();
      pinchStartDist = dist(t[0], t[1]);
      scaleAtPinchStart = activePlane.object3D.scale.x || 1;
      lastTouch = null;
    } else if (count === 1) {
      // pan a 1 dedo
      evt.preventDefault();
      lastTouch = { x: t[0].clientX, y: t[0].clientY };
    }
  }
  function onTouchMove(evt){
    if (!gestureEnabled || !activePlane) return;
    const { count, t } = getTouchInfo(evt);
    if (count === 2 && pinchStartDist > 0) {
      evt.preventDefault();
      const d = dist(t[0], t[1]);
      let s = scaleAtPinchStart * (d / pinchStartDist);
      s = Math.max(0.3, Math.min(6.0, s)); // límites de zoom
      activePlane.object3D.scale.set(s, s, s);
    } else if (count === 1 && lastTouch) {
      evt.preventDefault();
      const dx = t[0].clientX - lastTouch.x;
      const dy = t[0].clientY - lastTouch.y;
      lastTouch = { x: t[0].clientX, y: t[0].clientY };

      // Mapea píxeles a metros de forma suave
      const k = 0.002 * (activePlane.object3D.scale.x || 1);
      // Nota: y de pantalla crece hacia abajo, en 3D y crece hacia arriba
      activePlane.object3D.position.x += dx * k;
      activePlane.object3D.position.y += -dy * k;
    }
  }
  function onTouchEnd(){
    const anyTouches = (window.TouchEvent && event.touches) ? event.touches.length : 0;
    if (anyTouches < 2) pinchStartDist = 0;
    if (anyTouches === 0) lastTouch = null;
  }

  // Crear targets que muestran el PNG con hold+gestos
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    const target = document.createElement("a-entity");
    target.setAttribute("mindar-image-target", `targetIndex: ${i}`);

    let plane = null;

    target.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;
      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      // Al volver a encontrar, cancela ocultado y desactiva gestos (vuelve a modo AR)
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      disableGestures();

      if (!plane) {
        plane = document.createElement("a-plane");

        // Tamaño: ajusta el ancho; alto mantiene el aspecto del PNG
        const width = 5.0;                // en metros sobre el marcador
        const height = width / arAspect;  // respeta aspect-ratio

        plane.setAttribute("width", width.toString());
        plane.setAttribute("height", height.toString());
        plane.setAttribute("position", "0 0 0.01"); // evita z-fighting
        plane.setAttribute("rotation", "0 0 0");

        // Material iluminado (más brillo en letras)
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
      if (!plane) return;

      // En lugar de ocultar de inmediato, mantenemos visible durante HOLD_MS
      // y habilitamos GESTOS para que el usuario pueda acercar/alejar/mover.
      if (hideTimeout) clearTimeout(hideTimeout);

      // Activa gestos de lectura
      enableGestures(plane);

      // Opcional: pequeño “pop-out” y lo dejamos visible
      plane.emit("hide");
      setTimeout(() => {
        plane.setAttribute("visible", "true");
      }, 140);

      hideTimeout = setTimeout(() => {
        // Pasados HOLD_MS, ocultamos y desactivamos gestos si no se recuperó el tracking
        if (plane) plane.setAttribute("visible", "false");
        disableGestures();
        hideTimeout = null;
      }, HOLD_MS);
    });

    scene.appendChild(target);
  }
});
