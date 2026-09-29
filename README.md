# Cape UV — Blockbench Plugin

An advanced Blockbench plugin that maps mesh and cube faces to an organized UV grid with custom 2D Bounding Box packing, small-to-large stacking, and pixel-perfect controls.

---

## Installation

1. Open **Blockbench**.
2. Go to **File → Plugins → Load Plugin from File**.
3. Select `cape_uv.js`.

The plugin action will be available under **UV → Cape UV (Advanced Grid)** and **Tools → Cape UV (Advanced Grid)**.

---

## Usage

1. Select the meshes/cubes you want to unwrap (or leave empty to process the entire model).
2. Click **UV → Cape UV (Advanced Grid)**.
3. Adjust your grid options in the dialog and click **Apply Grid**.

---

## Dialog Options

| Option | Description |
|---|---|
| **Number of Columns** | Set how many columns the layout uses. Rows are calculated automatically. |
| **Padding X (px)** | Horizontal spacing in pixels between UV cells. |
| **Padding Y (px)** | Vertical spacing in pixels between UV cells. |
| **Sort Stack (Small to Large)** | Sorts faces by 2D area, packing smaller faces first to optimize space. |
| **Keep Aspect Ratio (2D BBox)** | Uses a local 2D Bounding Box to keep face aspect ratios intact without stretching. |
| **Round UVs (Integer Pixels)** | Snaps all UV coordinates strictly to integer pixel positions for crisp texturing. |
| **Force Quads as Rectangles** | Forces 4-vertex quad faces to align perfectly to cell rectangle corners. |
| **Scale by Real 3D Size** | Scales cell dimensions relative to the face's actual size in 3D space. |

---

## How It Works

1. **Gathers Faces:** Collects selected (or all) mesh faces and cube faces.
2. **2D Bounding Box Calculation:** Computes local tangent projections and tight 2D bounding boxes (`w`, `h`) for every face.
3. **Small-to-Large Stacking:** Sorts face items by total 2D area (`w * h`) when enabled.
4. **Grid Positioning:** Distributes faces side-by-side into a grid based on your chosen column count and padding.
5. **UV Assignment:** Maps vertex coordinates to grid cells while preserving aspect ratio, pixel rounding, or rectangle constraints.

---

## Features

- **Mesh & Cube Support:** Fully compatible with both Mesh geometries and standard Cubes.
- **Pixel-Perfect Alignment:** Option to snap UV vertices to exact pixels.
- **Full History Integration:** Complete Undo/Redo (`Ctrl + Z`) support.
- **Zero Overflow:** Layout fits cleanly within active texture or project resolution.
