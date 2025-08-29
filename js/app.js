/* --- Componente: sticky-follow ---------------------------------------------------
   Sigue la pose del anchor mientras haya tracking; cuando se pierde el marcador,
   congela la última pose y mantiene visible durante holdMs, luego oculta.
----------------------------------------------------------------------------------- */
AFRAME.registerComponent('sticky-follow', {
  schema: {
    source: { type: 'selector' }, // anchor <a-entity mindar-image-target>
    pos: { default: 0.15 },       // suavizado posición (0..1, mayor = más suave)
    rot: { default: 0.20 },       // suavizado rotación
    scl: { default: 0.15 },       // suavizado escala
    holdMs: { default: 10000 }    // ms visibles tras perder el marcador
  },
  init() {
    this.tracking = false;
    this.hideTimeout = null;

    this.tPos = new THREE.Vector3();
    this.tQuat = new THREE.Quaternion();
    this.tScl = new THREE.Vector3(1,1,1);

    this.curPos = new THREE.Vector3();
    this.curQuat = new THREE.Quaternion();
    this.curScl = new THREE.Vector3(1,1,1);

    this.tmpM = new THREE.Matrix4();

    const anchor = this.data.source;
    if (!anchor) return;

    // Eventos del anchor MindAR
    this._onFound = () => {
      this.tracking = true;
      if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
      this.el.setAttribute('visible', 'true'); // asegurar visible al encontrar
    };
    this._onLost = () => {
      this.tracking = false;
      // Mantener visible durante holdMs y luego ocultar
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      this.hideTimeout = setTimeout(() => {
        this.el.setAttribute('visible', 'false');
      }, this.data.holdMs);
    };

    anchor.addEventListener('targetFound', this._onFound);
    anchor.addEventListener('targetLost',  this._onLost);
  },
  remove(){
    const anchor = this.data.source;
    if (!anchor) return;
    if (this._onFound) anchor.removeEventListener('targetFound', this._onFound);
    if (this._onLost)  anchor.removeEventListener('targetLost',  this._onLost);
  },
  tick(t, dt) {
    const anchor = this.data.source;
    if (!anchor) return;
    // Si hay tracking, copiamos pose world del anchor (con suavizado)
    if (this.tracking) {
      anchor.object3D.updateWorldMatrix(true, false);
      this.tmpM.copy(anchor.object3D.matrixWorld);
      this.tmpM.decompose(this.tPos, this.tQuat, this.tScl);

      const base = Math.max(dt || 16.666, 16.666);
      const kPos = 1 - Math.pow(1 - this.data.pos, base / 16.666);
      const kRot = 1 - Math.pow(1 - this.data.rot, base / 16.666);
      const kScl = 1 - Math.pow(1 - this.data.scl, base / 16.666);

      const o = this.el.object3D;
      o.position.lerp(this.tPos, kPos);
      o.quaternion.slerp(this.tQuat, kRot);
      this.curScl.lerp(this.tScl, kScl);
      o.scale.copy(this.curScl);

      // Guardar actuales (por si se pierde justo en este frame)
      this.curPos.copy(o.position);
      this.curQuat.copy(o.quaternion);
    }
    // Si NO hay tracking, mantenemos la última pose (o sea: congelado)
    // (Ya quedó con la última transform; no hacemos nada más aquí)
  }
});


document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const markerInfo = document.getElementById("marker-info");
  const clickSound = document.getElementById("click-sound");
  const loader = document.getElementById("loader");
  const startBtn = document.getElementById("start-experience");
  const camError = document.getElementById("cam-error");
  const imgAsset = document.getElementById("ar-img");

  const TOTAL_MARCADORES = 1;
  const HOLD_MS = 10000;   // <- tiempo que se mantiene visible tras perder el marcador
  const PLANE_WIDTH = 5.0; // tu tamaño actual (ajústalo si lo necesitas)

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

  // Construcción de anchors y contenidos sticky
  for (let i = 0; i < TOTAL_MARCADORES; i++) {
    // Anchor (MindAR) - solo tracking; NO meteremos el plano como hijo
    const anchor = document.createElement("a-entity");
    anchor.setAttribute("id", `anchor-${i}`);
    anchor.setAttribute("mindar-image-target", `targetIndex: ${i}`);
    scene.appendChild(anchor);

    // Contenedor del contenido (sigue al anchor mientras haya tracking)
    const content = document.createElement("a-entity");
    content.setAttribute(
      "sticky-follow",
      `source: #anchor-${i}; pos: 0.15; rot: 0.20; scl: 0.15; holdMs: ${HOLD_MS}`
    );
    content.setAttribute("visible", "false"); // se mostrará al targetFound
    scene.appendChild(content);

    // Plano con PNG (hijo de content, NO del anchor)
    const plane = document.createElement("a-plane");

    const height = PLANE_WIDTH / arAspect;  // respeta aspect-ratio
    plane.setAttribute("width", PLANE_WIDTH.toString());
    plane.setAttribute("height", height.toString());
    plane.setAttribute("position", "0 0 0.01"); // evita z-fighting
    plane.setAttribute("rotation", "0 0 0");

    // Material iluminado (resalta letras)
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

    content.appendChild(plane);

    // HUD y show/hide coordinado
    anchor.addEventListener("targetFound", () => {
      if (!experienciaIniciada) return;
      console.log(`✅ Marcador detectado: targetIndex = ${i}`);
      if (markerInfo) markerInfo.innerText = `Marcador: ${i}`;

      content.setAttribute("visible", "true");
      plane.setAttribute("visible", "true");
      plane.emit("show");
    });

    anchor.addEventListener("targetLost", () => {
      if (markerInfo) markerInfo.innerText = `Marcador: ---`;
      // No ocultamos aquí: lo hará el componente después de HOLD_MS
      // Solo un pequeño “pop-out” visual si quieres
      plane.emit("hide");
      setTimeout(() => {
        // mantenemos visible (content/plane) hasta que sticky-follow lo oculte
        plane.setAttribute("visible", "true");
      }, 140);
    });
  }
});
