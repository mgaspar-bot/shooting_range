import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

// Loads a GLB once per url and gives every caller the same vertex-colored
// template to clone from. Uses a lit material (not the original PBR one,
// which needs image textures this model doesn't have) so bevelled edges -
// like the groove around each floor tile - actually catch light and read
// as borders, instead of flattening into one unlit color.
//
// Also recenters the geometry so X/Z are centered and Y=0 sits at the
// bottom of the bounding box. Some models (e.g. a ceiling tile) are
// authored at their real-world install height instead of the local
// origin, and scaling an object around an origin far from its own
// geometry blows its position up along with its size - recentering here
// makes every template safe to scale/tile the same way.
function loadTileTemplate(url: string): Promise<THREE.Object3D> {
    let template = modelCache.get(url);
    if (!template) {
        template = loader.loadAsync(url).then((gltf) => {
            const scene = gltf.scene;
            scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
                }
            });

            const bounds = new THREE.Box3().setFromObject(scene);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry = child.geometry.clone();
                    child.geometry.translate(-center.x, -bounds.min.y, -center.z);
                }
            });

            return scene;
        });
        modelCache.set(url, template);
    }
    return template;
}

// The cached template's materials are shared by every caller of this url,
// so tinting them directly would recolor every use of the model scene-wide.
// This clones just the materials this instance touches (once per unique
// material found, in case a model has several meshes) and multiplies in
// the tint - vertex colors x material.color is how these models get their
// color at all, so this preserves each model's existing shading/contrast.
function applyTint(root: THREE.Object3D, tint: THREE.ColorRepresentation): void {
    const cloned = new Map<THREE.Material, THREE.Material>();
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const original = child.material as THREE.MeshStandardMaterial;
        let tinted = cloned.get(original);
        if (!tinted) {
            tinted = original.clone();
            (tinted as THREE.MeshStandardMaterial).color.set(tint);
            cloned.set(original, tinted);
        }
        child.material = tinted;
    });
}

// Parses "#rrggbb" into raw 0-1 floats with no color-space conversion.
// Vertex colors from GLTFLoader are raw buffer floats, so matching or
// writing them has to bypass THREE.Color's default sRGB<->linear handling
// (meant for material/style colors) or the numbers just won't line up.
function parseHexRaw(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    return [
        parseInt(clean.substring(0, 2), 16) / 255,
        parseInt(clean.substring(2, 4), 16) / 255,
        parseInt(clean.substring(4, 6), 16) / 255,
    ];
}

// Precise per-color palette swap, unlike applyTint's uniform multiply.
// Some models (like the reception desk) bake several unrelated colors -
// body, trim, accent stripe - as flat-shaded regions of the SAME mesh, so
// there's no single mesh/material to tint independently per part. This
// replaces specific original vertex colors with specific new ones instead;
// keys are the exact original colors found in the model (as "#rrggbb").
function applyRecolor(root: THREE.Object3D, palette: Record<string, string>): void {
    const targets = new Map<string, [number, number, number]>();
    for (const [original, target] of Object.entries(palette)) {
        const [r, g, b] = parseHexRaw(original);
        const key = [r, g, b].map((v) => Math.round(v * 255)).join(',');
        targets.set(key, parseHexRaw(target));
    }

    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const colorAttr = child.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (!colorAttr) return;

        const remapped = colorAttr.clone();
        for (let i = 0; i < remapped.count; i++) {
            const key = [remapped.getX(i), remapped.getY(i), remapped.getZ(i)]
                .map((v) => Math.round(v * 255))
                .join(',');
            const target = targets.get(key);
            if (target) remapped.setXYZ(i, target[0], target[1], target[2]);
        }

        child.geometry = child.geometry.clone();
        child.geometry.setAttribute('color', remapped);
    });
}

// Loads a single GLB as a standalone piece (furniture, props - anything
// that isn't tiled across a surface). These models are authored at a
// real-world scale much smaller than this scene's units, so a uniform
// `scale` is applied - pick it empirically, same as the tile sizes above.
// `tint` multiplies onto the model's own vertex colors (see applyTint);
// `recolor` swaps specific baked colors for specific new ones instead
// (see applyRecolor) - use it when a model's parts share one mesh so a
// uniform tint can't retarget them independently.
export function createGltfModel(
    url: string,
    scale = 1,
    tint?: THREE.ColorRepresentation,
    recolor?: Record<string, string>,
): THREE.Group {
    const group = new THREE.Group();

    loadTileTemplate(url).then((source) => {
        const instance = source.clone(true);
        instance.scale.setScalar(scale);
        if (recolor) applyRecolor(instance, recolor);
        if (tint !== undefined) applyTint(instance, tint);
        group.add(instance);
    });

    return group;
}

interface TileGridOptions {
    flip?: boolean;
    tint?: THREE.ColorRepresentation;
}

// Shared tiling core: clones a GLB across a flat width x depth grid,
// picking a tile count from targetTileSize and scaling each tile so the
// grid exactly fills the area. `flip` mirrors the tile vertically (for a
// ceiling, where the underside should show the "up"-facing detail).
function tileHorizontalSurface(
    url: string,
    width: number,
    depth: number,
    thickness: number,
    targetTileSize: number,
    { flip = false, tint }: TileGridOptions = {},
): THREE.Group {
    const group = new THREE.Group();

    loadTileTemplate(url).then((source) => {
        const bounds = new THREE.Box3().setFromObject(source);
        const size = new THREE.Vector3();
        bounds.getSize(size);

        const cols = Math.max(1, Math.round(width / targetTileSize));
        const rows = Math.max(1, Math.round(depth / targetTileSize));
        const scaleX = width / (cols * size.x);
        const scaleZ = depth / (rows * size.z);
        const scaleYMagnitude = thickness / size.y;
        const scaleY = flip ? -scaleYMagnitude : scaleYMagnitude;

        const tileWidth = size.x * scaleX;
        const tileDepth = size.z * scaleZ;
        const startX = -width / 2 + tileWidth / 2;
        const startZ = -depth / 2 + tileDepth / 2;
        // Un-flipped: the model's top face (bounds.max.y) lands on y = 0.
        // Flipped: the same face lands on y = 0 but now facing down, with
        // the tile's bulk extending up into +thickness above it.
        const y = flip ? bounds.max.y * scaleYMagnitude : -bounds.max.y * scaleYMagnitude;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tile = source.clone(true);
                tile.scale.set(scaleX, scaleY, scaleZ);
                tile.position.set(startX + col * tileWidth, y, startZ + row * tileDepth);
                if (tint !== undefined) applyTint(tile, tint);
                group.add(tile);
            }
        }
    });

    return group;
}

// Tiles a GLB across a floor: the top surface sits at local y = 0,
// extending down by `thickness`. `tint` multiplies onto the model's own
// vertex colors (see applyTint) - omit it to use the model's own colors.
export function createTiledFloor(
    url: string,
    width: number,
    depth: number,
    thickness = 2,
    targetTileSize = 25,
    tint?: THREE.ColorRepresentation,
): THREE.Group {
    return tileHorizontalSurface(url, width, depth, thickness, targetTileSize, { tint });
}

// Tiles a GLB across a ceiling: the visible (underside) surface sits at
// local y = 0, extending up by `thickness` - so positioning the returned
// group at a room's ceiling height puts the visible face right there.
export function createTiledCeiling(
    url: string,
    width: number,
    depth: number,
    thickness = 2,
    targetTileSize = 25,
    tint?: THREE.ColorRepresentation,
): THREE.Group {
    return tileHorizontalSurface(url, width, depth, thickness, targetTileSize, { flip: true, tint });
}

export interface WallHole {
    x: number; // local x, centered on the wall like `width` below
    y: number; // height above the floor
    width: number;
    height: number;
}

// Some models (e.g. a floor tile) are authored flat - thin in Y, their
// decorative face normal pointing up (local +Y). createTiledWall expects
// the opposite: thin in Z, decorative face normal pointing along local -Z
// (Room's convention for a wall panel's "front" - the direction it's
// meant to be viewed from; see Room's WALL_ROTATION). Rotating -90deg
// around X maps +Y to -Z, converting one into the other. Works on its own
// clone, not the shared cached template other callers (like using the
// same model as an actual floor) still read from.
function reorientFloorAsWallTemplate(template: THREE.Object3D): THREE.Object3D {
    const reoriented = template.clone(true);
    reoriented.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry = child.geometry.clone();
        child.geometry.rotateX(-Math.PI / 2);
    });
    return reoriented;
}

// Clones `source` scaled and positioned to exactly fill [left,right] x
// [bottom,top] in the wall's local frame, at the given z-thickness scale.
// Used both for a plain tile (its own cell, unaffected by any hole) and
// for the small trimmed pieces bordering a hole - same math either way,
// just with different rectangles.
function addWallTile(
    group: THREE.Group,
    source: THREE.Object3D,
    nativeSize: THREE.Vector3,
    scaleZ: number,
    left: number,
    right: number,
    bottom: number,
    top: number,
    tint?: THREE.ColorRepresentation,
): void {
    const width = right - left;
    const height = top - bottom;
    if (width < 1e-6 || height < 1e-6) return;

    const tile = source.clone(true);
    tile.scale.set(width / nativeSize.x, height / nativeSize.y, scaleZ);
    tile.position.set((left + right) / 2, bottom, 0);
    if (tint !== undefined) applyTint(tile, tint);
    group.add(tile);
}

// Tiles copies of a GLB across a flat vertical rectangle (a wall face),
// picking a tile count from targetTileSize and scaling each tile so the
// grid exactly fills width x height, and to the given thickness in depth.
// The group is centered on its local origin, matching Wall's box pivot.
// `tint` multiplies onto the model's own vertex colors (see applyTint).
//
// `hole`, if given, punches a doorway-shaped gap into the wall: the tile
// grid is computed exactly as it would be for a plain, uninterrupted wall,
// and every tile that doesn't touch the hole is placed exactly as it would
// be on a plain wall. Only the handful of tiles whose cell actually
// straddles the hole's edge are trimmed - each split (via the standard
// "cross" rectangle subtraction: top strip, bottom strip, then left/right
// strips in the remaining middle band) into the one to four pieces of that
// cell left outside the hole, each individually rescaled to fit its own
// small piece exactly. So the hole itself is pixel-exact to `hole`'s
// dimensions, while every tile not touching it keeps the wall's normal,
// uniform tile size.
//
// `reorientAsWall` repurposes a model authored flat (like a floor tile) as
// wall cladding instead - see reorientFloorAsWallTemplate.
export function createTiledWall(
    url: string,
    width: number,
    height: number,
    thickness: number,
    targetTileSize = 25,
    tint?: THREE.ColorRepresentation,
    hole?: WallHole,
    reorientAsWall = false,
): THREE.Group {
    const group = new THREE.Group();

    loadTileTemplate(url).then((template) => {
        const source = reorientAsWall ? reorientFloorAsWallTemplate(template) : template;
        const bounds = new THREE.Box3().setFromObject(source);
        const size = new THREE.Vector3();
        bounds.getSize(size);

        const cols = Math.max(1, Math.round(width / targetTileSize));
        const rows = Math.max(1, Math.round(height / targetTileSize));
        const scaleX = width / (cols * size.x);
        const scaleY = height / (rows * size.y);
        const scaleZ = thickness / size.z;

        const tileWidth = size.x * scaleX;
        const tileHeight = size.y * scaleY;
        const startX = -width / 2 + tileWidth / 2;
        const startY = -height / 2 - bounds.min.y * scaleY;

        const holeLeft = hole ? hole.x - hole.width / 2 : 0;
        const holeRight = hole ? hole.x + hole.width / 2 : 0;
        const holeBottom = hole ? hole.y - height / 2 : 0;
        const holeTop = hole ? holeBottom + hole.height : 0;

        for (let row = 0; row < rows; row++) {
            const cellBottom = startY + row * tileHeight;
            const cellTop = cellBottom + tileHeight;

            for (let col = 0; col < cols; col++) {
                const cellCenterX = startX + col * tileWidth;
                const cellLeft = cellCenterX - tileWidth / 2;
                const cellRight = cellCenterX + tileWidth / 2;

                const overlapsHole =
                    hole &&
                    cellRight > holeLeft &&
                    cellLeft < holeRight &&
                    cellTop > holeBottom &&
                    cellBottom < holeTop;

                if (!overlapsHole) {
                    addWallTile(group, source, size, scaleZ, cellLeft, cellRight, cellBottom, cellTop, tint);
                    continue;
                }

                // Cross subtraction: the cell minus the hole, in up to four pieces.
                if (holeTop < cellTop) {
                    addWallTile(group, source, size, scaleZ, cellLeft, cellRight, Math.max(cellBottom, holeTop), cellTop, tint);
                }
                if (holeBottom > cellBottom) {
                    addWallTile(group, source, size, scaleZ, cellLeft, cellRight, cellBottom, Math.min(cellTop, holeBottom), tint);
                }
                const midBottom = Math.max(cellBottom, holeBottom);
                const midTop = Math.min(cellTop, holeTop);
                if (holeLeft > cellLeft) {
                    addWallTile(group, source, size, scaleZ, cellLeft, Math.min(cellRight, holeLeft), midBottom, midTop, tint);
                }
                if (holeRight < cellRight) {
                    addWallTile(group, source, size, scaleZ, Math.max(cellLeft, holeRight), cellRight, midBottom, midTop, tint);
                }
            }
        }
    });

    return group;
}
