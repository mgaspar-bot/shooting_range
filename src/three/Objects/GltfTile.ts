import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

// Loads a GLB once per url and gives every caller the same vertex-colored
// template to clone from. Uses a lit material (not the original PBR one,
// which needs image textures this model doesn't have) so bevelled edges -
// like the groove around each floor tile - actually catch light and read
// as borders, instead of flattening into one unlit color.
function loadTileTemplate(url: string): Promise<THREE.Object3D> {
    let template = modelCache.get(url);
    if (!template) {
        template = loader.loadAsync(url).then((gltf) => {
            gltf.scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
                }
            });
            return gltf.scene;
        });
        modelCache.set(url, template);
    }
    return template;
}

// Tiles copies of a GLB across a flat horizontal rectangle (a floor),
// picking a tile count from targetTileSize and scaling each tile so the
// grid exactly fills width x depth. The floor's top surface sits at
// local y = 0, extending down by `thickness`.
export function createTiledFloor(
    url: string,
    width: number,
    depth: number,
    thickness = 2,
    targetTileSize = 25,
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
        const scaleY = thickness / size.y;

        const tileWidth = size.x * scaleX;
        const tileDepth = size.z * scaleZ;
        const startX = -width / 2 + tileWidth / 2;
        const startZ = -depth / 2 + tileDepth / 2;
        const y = -bounds.max.y * scaleY;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tile = source.clone(true);
                tile.scale.set(scaleX, scaleY, scaleZ);
                tile.position.set(startX + col * tileWidth, y, startZ + row * tileDepth);
                group.add(tile);
            }
        }
    });

    return group;
}

// Tiles copies of a GLB across a flat vertical rectangle (a wall face),
// picking a tile count from targetTileSize and scaling each tile so the
// grid exactly fills width x height, and to the given thickness in depth.
// The group is centered on its local origin, matching Wall's box pivot.
export function createTiledWall(
    url: string,
    width: number,
    height: number,
    thickness: number,
    targetTileSize = 25,
): THREE.Group {
    const group = new THREE.Group();

    loadTileTemplate(url).then((source) => {
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

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tile = source.clone(true);
                tile.scale.set(scaleX, scaleY, scaleZ);
                tile.position.set(startX + col * tileWidth, startY + row * tileHeight, 0);
                group.add(tile);
            }
        }
    });

    return group;
}
