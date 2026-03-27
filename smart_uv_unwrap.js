(() => {
  BBPlugin.register("smart_uv_unwrap", {
    title: "Smart UV Unwrap",
    author: "Custom Plugin",
    description: "UV Unwrap con cuadro de diálogo: UV Cape y UV Grid pixel perfect.",
    version: "4.2.0",
    variant: "both",
    tags: ["UV", "Texturing"],

    onload() {
      const self = this;

      self.action = new Action("smart_uv_unwrap_dialog", {
        name: "Smart UV Unwrap...",
        description: "Abre el cuadro de diálogo de UV Unwrap",
        icon: "view_in_ar",
        click() {
          window._uvMode = "cape";

          const dialog = new Dialog({
            id: "smart_uv_unwrap_dialog",
            title: "Smart UV Unwrap",
            width: 380,
            lines: [`
              <style>
                .suv-btn {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  padding: 10px 12px;
                  margin: 4px 0;
                  border: 2px solid var(--color-border);
                  border-radius: 5px;
                  cursor: pointer;
                  background: var(--color-back);
                  width: 100%;
                  text-align: left;
                  box-sizing: border-box;
                }
                .suv-btn:hover { border-color: var(--color-accent); background: var(--color-selected); }
                .suv-btn.active { border-color: var(--color-accent); background: var(--color-selected); }
                .suv-icon { font-size: 22px; flex-shrink: 0; }
                .suv-title { font-size: 13px; font-weight: 600; color: var(--color-text); display: block; }
                .suv-desc  { font-size: 11px; color: var(--color-subtle_text); display: block; margin-top: 2px; }
              </style>
              <div style="padding: 10px 2px 4px;">
                <button class="suv-btn active" id="suv_cape" onclick="window._uvMode='cape';document.getElementById('suv_cape').classList.add('active');document.getElementById('suv_grid').classList.remove('active');">
                  <span class="suv-icon">🧣</span>
                  <span>
                    <span class="suv-title">UV Cape</span>
                    <span class="suv-desc">Face por face, una al lado de la otra.</span>
                  </span>
                </button>
                <button class="suv-btn" id="suv_grid" onclick="window._uvMode='grid';document.getElementById('suv_grid').classList.add('active');document.getElementById('suv_cape').classList.remove('active');">
                  <span class="suv-icon">⊞</span>
                  <span>
                    <span class="suv-title">UV Grid (pixel perfect)</span>
                    <span class="suv-desc">Grilla uniforme. Triángulos de a dos por celda.</span>
                  </span>
                </button>
              </div>
            `],
            buttons: ["Aplicar", "Cancelar"],
            onConfirm() {
              const mode = window._uvMode || "cape";
              delete window._uvMode;
              runMode(mode);
            },
            onCancel() { delete window._uvMode; },
          });

          dialog.show();
        },
      });

      MenuBar.addAction(self.action, "uv");
      MenuBar.addAction(self.action, "tools");

      function runMode(mode) {
        const targetMeshes = Mesh.selected.length ? Mesh.selected : Mesh.all;
        const targetCubes  = Cube.selected.length ? Cube.selected : Cube.all;
        if (!targetMeshes.length && !targetCubes.length) {
          Blockbench.showQuickMessage("No hay elementos para procesar.", 2000);
          return;
        }
        Undo.initEdit({ elements: [...targetMeshes, ...targetCubes] });
        const [tw, th] = getTextureSize();
        if (mode === "cape") runCape(targetMeshes, targetCubes, tw, th);
        else                 runGrid(targetMeshes, targetCubes, tw, th);
        Undo.finishEdit("UV Unwrap: " + mode);
        Canvas.updateAll();
        Blockbench.showQuickMessage(`✓ UV ${mode} aplicado`, 2500);
      }
    },

    onunload() { this.action && this.action.delete(); },
  });

  // ── UV CAPE ───────────────────────────────────────────────────────────────
  function runCape(meshes, cubes, tw, th) {
    const allFaces = [];
    meshes.forEach(mesh => {
      Object.keys(mesh.faces).forEach(faceKey => {
        allFaces.push({ mesh, faceKey, ...projectFace(mesh, faceKey) });
      });
    });
    layoutShelf(allFaces);
    allFaces.forEach(({ mesh, faceKey, uvs, ox, oy, scale }) => {
      const face = mesh.faces[faceKey];
      if (!face.uv) face.uv = {};
      face.vertices.forEach(vid => {
        const [u, v] = uvs[vid];
        face.uv[vid] = [(ox + u * scale) * tw, (oy + v * scale) * th];
      });
    });
    cubes.forEach(cube => unwrapCube(cube, tw, th));
  }

  // ── UV GRID ───────────────────────────────────────────────────────────────
  function runGrid(meshes, cubes, tw, th) {
    const quads = [], tris = [];
    meshes.forEach(mesh => {
      Object.keys(mesh.faces).forEach(faceKey => {
        (mesh.faces[faceKey].vertices.length >= 4 ? quads : tris).push({ mesh, faceKey });
      });
    });
    const triPairs = [];
    for (let i = 0; i < tris.length; i += 2)
      triPairs.push([tris[i], tris[i+1] || null]);

    const total  = quads.length + triPairs.length + cubes.length * 6;
    const aspect = tw / th;
    const cols   = Math.max(1, Math.ceil(Math.sqrt(total * aspect)));
    const rows   = Math.max(1, Math.ceil(total / cols));
    const cellW  = Math.floor(tw / cols);
    const cellH  = Math.floor(th / rows);
    if (cellW < 1 || cellH < 1) { Blockbench.showQuickMessage("⚠ Textura muy pequeña", 3000); return; }

    let ci = 0;
    const next = () => { const c=ci%cols, r=Math.floor(ci/cols); ci++; return {px:c*cellW, py:r*cellH, pw:cellW, ph:cellH}; };

    quads.forEach(({ mesh, faceKey }) => { const {px,py,pw,ph}=next(); applyFaceToCell(mesh,faceKey,px,py,pw,ph); });
    triPairs.forEach(([a, b]) => {
      const {px,py,pw,ph}=next();
      applyTriToCorner(a.mesh,a.faceKey,[px,py],[px+pw,py],[px,py+ph]);
      if (b) applyTriToCorner(b.mesh,b.faceKey,[px+pw,py+ph],[px,py+ph],[px+pw,py]);
    });
    cubes.forEach(cube => {
      ["up","down","north","south","west","east"].forEach(n => {
        if (cube.faces[n]) { const {px,py,pw,ph}=next(); cube.faces[n].uv=[px,py,px+pw,py+ph]; cube.faces[n].rotation=0; }
      });
    });
    Blockbench.showQuickMessage(`✓ Grid: ${cols}×${rows} celdas ${cellW}×${cellH}px`, 3000);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function projectFace(mesh, faceKey) {
    const face=mesh.faces[faceKey], [U,V]=buildTangentBasis(getFaceNormal(mesh,faceKey)), raw={};
    face.vertices.forEach(vid => { raw[vid]=[dot3(mesh.vertices[vid],U), dot3(mesh.vertices[vid],V)]; });
    let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
    Object.values(raw).forEach(([u,v])=>{ if(u<minU)minU=u;if(u>maxU)maxU=u;if(v<minV)minV=v;if(v>maxV)maxV=v; });
    const span=Math.max(maxU-minU,maxV-minV)||1, uvs={};
    face.vertices.forEach(vid=>{ uvs[vid]=[(raw[vid][0]-minU)/span,(raw[vid][1]-minV)/span]; });
    return { uvs, w:(maxU-minU)/span||1, h:(maxV-minV)/span||1 };
  }

  function applyFaceToCell(mesh, faceKey, px, py, pw, ph) {
    const face=mesh.faces[faceKey], [U,V]=buildTangentBasis(getFaceNormal(mesh,faceKey)), raw={};
    if (!face.uv) face.uv={};
    face.vertices.forEach(vid=>{ raw[vid]=[dot3(mesh.vertices[vid],U),dot3(mesh.vertices[vid],V)]; });
    let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
    Object.values(raw).forEach(([u,v])=>{ if(u<minU)minU=u;if(u>maxU)maxU=u;if(v<minV)minV=v;if(v>maxV)maxV=v; });
    const sU=(maxU-minU)||1, sV=(maxV-minV)||1;
    face.vertices.forEach(vid=>{ face.uv[vid]=[px+((raw[vid][0]-minU)/sU)*pw, py+((raw[vid][1]-minV)/sV)*ph]; });
  }

  function applyTriToCorner(mesh, faceKey, A, B, C) {
    const face=mesh.faces[faceKey]; if(!face.uv)face.uv={};
    const v=face.vertices;
    if(v[0]!=null)face.uv[v[0]]=A; if(v[1]!=null)face.uv[v[1]]=B; if(v[2]!=null)face.uv[v[2]]=C;
  }

  function layoutShelf(faces) {
    if (!faces.length) return;
    const M=0.005, cols=Math.ceil(Math.sqrt(faces.length)), cell=(1-M*(cols+1))/cols;
    let cx=M, cy=M, rowH=0;
    faces.forEach(f => {
      const fw=f.w*cell, fh=f.h*cell;
      if (cx+fw>1-M+0.0001){cy+=rowH+M;cx=M;rowH=0;}
      f.ox=cx;f.oy=cy;f.scale=cell; cx+=fw+M; if(fh>rowH)rowH=fh;
    });
  }

  function unwrapCube(cube, tw, th) {
    const sx=Math.abs(cube.to[0]-cube.from[0]),sy=Math.abs(cube.to[1]-cube.from[1]),sz=Math.abs(cube.to[2]-cube.from[2]);
    const sc=Math.min(tw/(2*(sx+sz)),th/(sy+sz));
    const L={up:[sz,0,sx,sz],down:[sz+sx,0,sx,sz],north:[sz,sz,sx,sy],south:[sz+sx+sz,sz,sx,sy],west:[0,sz,sz,sy],east:[sz+sx,sz,sz,sy]};
    for(const[n,[x,y,w,h]]of Object.entries(L)){if(cube.faces[n]){cube.faces[n].uv=[x*sc,y*sc,(x+w)*sc,(y+h)*sc];cube.faces[n].rotation=0;}}
  }

  function getFaceNormal(mesh, faceKey) {
    const f=mesh.faces[faceKey],v=f.vertices.map(id=>mesh.vertices[id]);
    if(v.length<3)return[0,1,0];
    return normalize3(cross3(sub3(v[1],v[0]),sub3(v[2],v[0])));
  }

  function buildTangentBasis(n) {
    const up=Math.abs(n[1])<0.99?[0,1,0]:[1,0,0];
    const U=normalize3(cross3(up,n)); return [U, normalize3(cross3(n,U))];
  }

  function getTextureSize() {
    const t=Texture.all[0]; if(t)return[t.width||16,t.height||16];
    if(typeof Project!=="undefined"&&Project.texture_width)return[Project.texture_width,Project.texture_height];
    return[16,16];
  }

  function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function normalize3(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2])||1;return[v[0]/l,v[1]/l,v[2]/l];}
})();