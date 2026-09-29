(() => {
  BBPlugin.register("cape_uv", {
    title: "Cape UV",
    author: "Custom Plugin",
    description: "Mapea cada cara a una celda en grilla en píxeles exactos sin solapamientos.",
    version: "6.1.0",
    variant: "both",
    tags: ["UV", "Texturing"],

    onload() {
      const self = this;
      self.settings = { padX: 1, padY: 1, keepLength: false };

      self.action = new Action("cape_uv_action", {
        name: "Cape UV (Grilla)",
        icon: "grid_on",
        click() {
          const s = self.settings;
          new Dialog({
            id: "cape_uv_dialog",
            title: "Cape UV - Grilla",
            width: 360,
            form: {
              padX:       { label: "Padding X (px)",   type: "number",   value: s.padX,       step: 1, min: 0 },
              padY:       { label: "Padding Y (px)",   type: "number",   value: s.padY,       step: 1, min: 0 },
              keepLength: { label: "Mantener Proporción Real", type: "checkbox", value: s.keepLength },
            },
            buttons: ["Aplicar", "Cancelar"],
            onConfirm(form) {
              s.padX       = Math.max(0, parseInt(form.padX) || 0);
              s.padY       = Math.max(0, parseInt(form.padY) || 0);
              s.keepLength = !!form.keepLength;
              runCapeUV(s);
            },
          }).show();
        },
      });

      MenuBar.addAction(self.action, "uv");
      MenuBar.addAction(self.action, "tools");
    },

    onunload() { 
      this.action && this.action.delete(); 
    },
  });

  // ════════════════════════════════════════════════════════════════════════
  // PROYECCIÓN POR GRILLA UNIFICADA
  // ════════════════════════════════════════════════════════════════════════

  function runCapeUV({ padX, padY, keepLength }) {
    const targetMeshes = Mesh.selected.length ? Mesh.selected : Mesh.all;
    const targetCubes  = Cube.selected.length ? Cube.selected : Cube.all;

    if (!targetMeshes.length && !targetCubes.length) {
      Blockbench.showQuickMessage("No hay elementos seleccionados para procesar.", 2000);
      return;
    }

    // Tamaño de la textura activa
    const tex  = Texture.all[0];
    const outW = (tex && tex.width)  || (Project && Project.texture_width)  || 128;
    const outH = (tex && tex.height) || (Project && Project.texture_height) || 128;

    const meshFaces = [];
    targetMeshes.forEach(mesh =>
      Object.keys(mesh.faces).forEach(fk => meshFaces.push({ mesh, fk }))
    );
    
    const cubeFaceList = [];
    targetCubes.forEach(cube => {
      ["up","down","north","south","west","east"].forEach(n => {
        if (cube.faces[n]) cubeFaceList.push({ cube, n });
      });
    });

    const total = meshFaces.length + cubeFaceList.length;
    if (!total) return;

    // Proporción real de caras de mallas
    const spans = meshFaces.map(({ mesh, fk }) => getFaceSpan(mesh, fk));
    const maxSpan = spans.reduce((m, s) => Math.max(m, s.spanU, s.spanV), 0) || 1;

    // Cálculo de filas y columnas en la grilla
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);

    const availW = outW - (cols + 1) * padX;
    const availH = outH - (rows + 1) * padY;

    const cellW = Math.max(1, Math.floor(availW / cols));
    const cellH = Math.max(1, Math.floor(availH / rows));

    // Generación de posiciones absolutas en la grilla
    const positions = [];
    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const px = padX + col * (cellW + padX);
      const py = padY + row * (cellH + padY);

      let cw = cellW;
      let ch = cellH;

      if (keepLength && i < meshFaces.length) {
        const s = spans[i];
        cw = Math.max(1, Math.round(cellW * (s.spanU / maxSpan)));
        ch = Math.max(1, Math.round(cellH * (s.spanV / maxSpan)));
      }

      positions.push({ px, py, cw, ch });
    }

    // Guardado de edición para historial Undo
    Undo.initEdit({ elements: [...targetMeshes, ...targetCubes] });

    // Mapear caras de Meshes
    meshFaces.forEach(({ mesh, fk }, i) => {
      const { px, py, cw, ch } = positions[i];
      mapFaceToCell(mesh, fk, px, py, cw, ch);
    });

    // Mapear caras de Cubos estándar
    cubeFaceList.forEach(({ cube, n }, i) => {
      const { px, py, cw, ch } = positions[meshFaces.length + i];
      cube.faces[n].uv       = [px, py, px + cw, py + ch];
      cube.faces[n].rotation = 0;
    });

    Undo.finishEdit("Cape UV");
    Canvas.updateAll();
    Blockbench.showQuickMessage(`✓ Cape UV · ${total} caras organizadas · ${outW}×${outH}px`, 2500);
  }

  // ── MAPEO PLANAR CON PROYECCIÓN NORMALIZADA DE VÉRTICES ──────────────
  function mapFaceToCell(mesh, faceKey, px, py, cw, ch) {
    const face = mesh.faces[faceKey];
    if (!face || !face.vertices || face.vertices.length < 3) return;

    if (!face.uv) face.uv = {};

    const vids = face.vertices;
    const [U, V] = buildTangentBasis(getFaceNormal(mesh, faceKey));
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;

    const localUVs = vids.map(vid => {
      const p = mesh.vertices[vid];
      const u = dot3(p, U);
      const v = dot3(p, V);
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
      return { vid, u, v };
    });

    const spanU = Math.max(0.0001, maxU - minU);
    const spanV = Math.max(0.0001, maxV - minV);

    localUVs.forEach(({ vid, u, v }) => {
      const normU = (u - minU) / spanU;
      const normV = (v - minV) / spanV;

      const finalU = px + normU * cw;
      const finalV = py + (1 - normV) * ch;

      face.uv[vid] = [
        Math.round(finalU * 100) / 100,
        Math.round(finalV * 100) / 100
      ];
    });
  }

  // ── MATEMÁTICAS Y VECTORES AUXILIARES ──────────────────────────────────
  function getFaceSpan(mesh, faceKey) {
    const face = mesh.faces[faceKey];
    if (!face || !face.vertices.length) return { spanU: 1, spanV: 1 };
    
    const [U, V] = buildTangentBasis(getFaceNormal(mesh, faceKey));
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;

    face.vertices.forEach(vid => {
      const p = mesh.vertices[vid];
      if (p) {
        const u = dot3(p, U), v = dot3(p, V);
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
    });

    return { spanU: Math.max(0.001, maxU - minU), spanV: Math.max(0.001, maxV - minV) };
  }

  function getFaceNormal(mesh, faceKey) {
    const f = mesh.faces[faceKey];
    const v = f.vertices.map(id => mesh.vertices[id]).filter(Boolean);
    if (v.length < 3) return [0, 1, 0];
    return normalize3(cross3(sub3(v[1], v[0]), sub3(v[2], v[0])));
  }

  function buildTangentBasis(n) {
    const up = Math.abs(n[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
    const U  = normalize3(cross3(up, n));
    const V  = normalize3(cross3(n, U));
    return [U, V];
  }

  function sub3(a,b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function dot3(a,b)   { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function cross3(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function normalize3(v) {
    const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]) || 1;
    return [v[0]/l, v[1]/l, v[2]/l];
  }
})();
