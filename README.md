# Cape UV — Blockbench Plugin

A Blockbench plugin that maps every face of a mesh to a square cell in a uniform grid, automatically fitting the result within your texture's resolution.

---

## Installation

1. Open Blockbench
2. Go to **File → Plugins → Load Plugin from File**
3. Select `cape_uv.js`

The action will appear under **UV → Cape UV** and **Tools → Cape UV**.

---

## Usage

1. Select the elements you want to unwrap (or select nothing to process the entire model)
2. Click **UV → Cape UV**
3. Configure the options in the dialog and click **Apply**

---

## Dialog Options

| Option | Description |
|---|---|
| **Padding X (px)** | Horizontal gap in pixels between each cell |
| **Padding Y (px)** | Vertical gap in pixels between each cell |
| **Keep Face Length** | When enabled, each cell is sized proportionally to the real-world dimensions of its face — larger faces get larger cells, smaller faces get smaller cells. When disabled, all cells are the same size. |

---

## How It Works

1. **Collects** all faces from selected meshes and cubes (or all elements if nothing is selected)
2. **Calculates** a grid layout — number of columns is determined by the square root of the total face count, adjusted for the texture's aspect ratio
3. **Sizes** each cell — either uniform or proportional to the face's tangent-plane span (Keep Face Length)
4. **Scales** the entire layout so it fits exactly within the output resolution
5. **Assigns** UV coordinates — vertices are sorted by angle around the face centroid (convex order) before being mapped to cell corners, ensuring clean quads with no crossed diagonals
6. Triangles are mapped to three corners of their cell (top-left, top-right, bottom-left)

---

## Notes

- Supports **Mesh** elements (Generic Model, Bedrock advanced) and **Cube** elements (Java / Bedrock basic)
- Works on selected elements or the entire model
- Fully **undoable** via Ctrl+Z
- The UV layout will always stay within the bounds of your texture — no overflow

---
