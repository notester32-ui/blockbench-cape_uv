(() => {
  BBPlugin.register("cape_uv", {
    title: "Cape UV",
    author: "Custom Plugin",
    description: "Maps faces to a grid with custom 2D BBox, small-to-large stacking, and customizable column count.",
    version: "2.0.0",
    variant: "both",
    tags: ["UV", "Texturing", "Grid"],

    onload() {
      const self = this;
      self.settings = { 
        columns: 8,
        padX: 1, 
        padY: 1, 
        keepAspectBBox: true,
        sortBySize: true,
        roundPixels: true, 
        forceRectQuads: false, 
        scaleBy3DSize: true 
      };

      self.action = new Action("cape_uv_grid_action", {
        name: "Cape UV (Advanced Grid)",
        icon: "grid_on",
        click() {
          const s = self.settings;
          new Dialog({
            id: "cape_uv_dialog_pro",
            title: "Cape UV - Grid Settings",
            width: 380,
            form: {
              columns:        { label: "Number of Columns", type: "number", value: s.columns, step: 1, min: 1 },
              padX:           { label: "Padding X (px)", type: "number", value: s.padX, step: 1, min: 0 },
              padY:           { label: "Padding Y (px)", type: "number", value: s.padY, step: 1, min: 0 },
              sortBySize:     { label: "Sort Stack (Small to Large)", type: "checkbox", value: s.sortBySize },
              keepAspectBBox: { label: "Keep Aspect Ratio (2D BBox)", type: "checkbox", value: s.keepAspectBBox },
              roundPixels:    { label: "Round UVs (Integer Pixels)", type: "checkbox", value: s.roundPixels },
              forceRectQuads: { label: "Force Quads as Rectangles", type: "checkbox", value: s.forceRectQuads },
              scaleBy3DSize:  { label: "Scale by Real 3D Size", type: "checkbox", value: s.scaleBy3DSize },
            },
            buttons: ["Apply Grid", "Cancel"],
            onConfirm(form) {
              s.columns        = Math.max(1, parseInt(form.columns) || 1);
              s.padX           = Math.max(0, parseInt(form.padX) || 0);
              s.padY           = Math.max(0, parseInt(form.padY) || 0);
              s.sortBySize     = !!form.sortBySize;
              s.keepAspectBBox = !!form.keepAspectBBox;
              s.roundPixels    = !!form.roundPixels;
              s.forceRectQuads = !!form.forceRectQuads;
              s.scaleBy3DSize  = !!form.scaleBy3DSize;
              runCapeUVPro(s);
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
  // PROJECTION & SIDE-BY-SIDE STACKING
  // ════════════════════════════════════════════════════════════════════════

  function runCapeUVPro({ columns, padX, padY, sortBySize, keepAspectBBox, roundPixels, forceRectQuads, scaleBy3DSize }) {
    const targetMeshes = Mesh.selected.length ? Mesh.selected : Mesh.all;
    const targetCubes  = Cube.selected.length ? Cube.selected : Cube.all;

    if (!targetMeshes.length && !targetCubes.length) {
      Blockbench.showQuickMessage("No elements selected to process.", 2000);
      return;
    }

    const tex  = Texture.all[0];
    const outW = (tex && tex.width)  || (Project && Project.texture_width)  || 128;
    const outH = (tex && tex.height) || (Project && Project.texture_height) || 128;

    let items = [];

    // Collect mesh faces with 2D BBox
    targetMeshes.forEach(mesh => {
      Object.keys(mesh.faces).forEach(fk => {
        const bbox = getFaceBBox2D(mesh, fk);
        items.push({ type: "mesh", mesh, fk, bbox, area: bbox.w * bbox.h });
      });
    });

    // Collect cube faces
    targetCubes.forEach(cube => {
      ["up","down","north","south","west","east"].forEach(n => {
        if (cube.faces[n]) {
          items.push({ type: "cube", cube, n, bbox: { w: 1, h: 1 }, area: 1 });
        }
      });
    });

    const total = items.length;
    if (!total) return;

    // Sort from SMALL to LARGE by 2D size (Stacking)
    if (sortBySize) {
      items.sort((a, b) => a.area - b.area);
    }

    const cols = columns;
    const rows = Math.ceil(total / cols);

    const maxSpan = items.reduce((m, item) => Math.max(m, item.bbox.w, item.bbox.h), 0) || 1;

    const availW = outW - (cols + 1) * padX;
    const availH = outH - (rows + 1) * padY;

    const baseCellW = Math.max(1, Math.floor(availW / cols));
    const baseCellH = Math.max(1, Math.floor(availH / rows));

    // Generate grid layout positions
    const positions = items.map((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const px = padX + col * (baseCellW + padX);
      const py = padY + row * (baseCellH + padY);

      let cw = baseCellW;
      let ch = baseCellH;

      if (item.type === "mesh") {
        const bbox = item.bbox;
        
        if (keepAspectBBox) {
          const aspect = bbox.w / (bbox.h || 1);
          if (aspect >= 1) {
            cw = baseCellW;
            ch = Math.max(1, Math.round(baseCellW / aspect));
          } else {
            ch = baseCellH;
            cw = Math.max(1, Math.round(baseCellH * aspect));
          }
        }

        if (scaleBy3DSize) {
          cw = Math.max(1, Math.round(cw * (bbox.w / maxSpan)));
          ch = Math.max(1, Math.round(ch * (bbox.h / maxSpan)));
        }
      }

      return { px, py, cw, ch };
    });

    Undo.initEdit({ elements: [...targetMeshes, ...targetCubes] });

    // Map sorted faces
    items.forEach((item, i) => {
      const { px, py, cw, ch } = positions[i];

      if (item.type === "mesh") {
        mapFaceToCellPro(item.mesh, item.fk, px, py, cw, ch, roundPixels, forceRectQuads, item.bbox);
      } else if (item.type === "cube") {
        let u0 = px, v0 = py, u1 = px + cw, v1 = py + ch;
        
        if (roundPixels) {
          u0 = Math.round(u0);
          v0 = Math.round(v0);
          u1 = Math.round(u1);
          v1 = Math.round(v1);
        }

        item.cube.faces[item.n].uv       = [u0, v0, u1, v1];
        item.cube.faces[item.n].rotation = 0;
      }
    });

    Undo.finishEdit("Cape UV Grid Pro");
    Canvas.updateAll();
    Blockbench.showQuickMessage(`✓ Cape UV Pro · Stacked ${total} faces across ${cols} columns`, 2500);
  }

  // ── CUSTOM 2D BBOX ──────────────────────────────────────────────────────
  function getFaceBBox2D(mesh, faceKey) {
    const face = mesh.faces[faceKey];
    if (!face || !face.vertices.length) return { minU: 0, maxU: 1, minV: 0, maxV: 1, w: 1, h: 1 };

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

    const w = Math.max(0.001, maxU - minU);
    const h = Math.max(0.001, maxV - minV);

    return { minU, maxU, minV, maxV, w, h };
  }

  // ── PLANAR MAPPING PROCESSED WITH BBOX ─────────────────────────────────
  function mapFaceToCellPro(mesh, faceKey, px, py, cw, ch, roundPixels, forceRectQuads, bbox) {
    const face = mesh.faces[faceKey];
    if (!face || !face.vertices || face.vertices.length < 3) return;

    if (!face.uv) face.uv = {};

    const vids = face.vertices;

    if (forceRectQuads && vids.length === 4) {
      const rectCorners = [
        [px, py],
        [px + cw, py],
        [px + cw, py + ch],
        [px, py + ch]
      ];

      vids.forEach((vid, idx) => {
        let u = rectCorners[idx][0];
        let v = rectCorners[idx][1];

        if (roundPixels) {
          u = Math.round(u);
          v = Math.round(v);
        }

        face.uv[vid] = [u, v];
      });
      return;
    }

    const [U, V] = buildTangentBasis(getFaceNormal(mesh, faceKey));
    const { minU, minV, w: spanU, h: spanV } = bbox || getFaceBBox2D(mesh, faceKey);

    vids.forEach(vid => {
      const p = mesh.vertices[vid];
      const u = dot3(p, U);
      const v = dot3(p, V);

      const normU = (u - minU) / spanU;
      const normV = (v - minV) / spanV;

      let finalU = px + normU * cw;
      let finalV = py + (1 - normV) * ch;

      if (roundPixels) {
        finalU = Math.round(finalU);
        finalV = Math.round(finalV);
      } else {
        finalU = Math.round(finalU * 100) / 100;
        finalV = Math.round(finalV * 100) / 100;
      }

      face.uv[vid] = [finalU, finalV];
    });
  }

  // ── HELPER & GEOMETRIC MATH FUNCTIONS ──────────────────────────────────
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
