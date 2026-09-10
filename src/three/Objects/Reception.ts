import * as THREE from 'three';
import { Room } from './Room';
import type { WallFactory } from './Room';
import { createTiledWall, createTiledFloor, createTiledCeiling, createGltfModel } from './GltfTile';
import { SCENE_SCALE } from '../scale';
import wallSegmentModel from '../../assets/models/wall-segment.glb';
import sidewalkTileModel from '../../assets/models/sidewalk-tile.glb';
import suspendedCeilingModel from '../../assets/models/suspended-ceiling-tile-018d2e.glb';
import serviceCounterModel from '../../assets/models/service-counter-module-3072ff.glb';
import wallDisplayBoardModel from '../../assets/models/wall-display-board-626293.glb';
import doorLeafModel from '../../assets/models/interior-door-leaf-a02f28.glb';

export const RECEPTION_SIZE = 100;
const COUNTER_NATIVE_DEPTH = 0.75; // z-extent of service-counter-module-3072ff.glb before scaling

// wall-display-board-626293.glb is authored mounted at its real install
// height (0.9m off the floor) rather than at its own local origin - see
// loadTileTemplate's recentering. This restores that offset at SCENE_SCALE.
const DISPLAY_BOARD_MOUNT_HEIGHT = 0.9 * SCENE_SCALE;

// wall-segment.glb's native width (meters), at SCENE_SCALE. A door's hole
// only lines up with the wall's own tiling if the tiles are actually
// rendered close to their real size - the old, much larger arbitrary
// panel size left a door-sized hole looking tiny inside a huge gap.
const WALL_TILE_SIZE = 2 * SCENE_SCALE;

// interior-door-leaf-a02f28.glb's native size (meters). The opening is
// sized to fit the leaf exactly - no separate clearance padding - so it's
// derived straight from the leaf's own dimensions at the same SCENE_SCALE
// as every other real-world prop, rather than an independently-tuned value.
const DOOR_LEAF_NATIVE_WIDTH = 0.9;
const DOOR_LEAF_NATIVE_HEIGHT = 2.1;
const DOOR_WIDTH = DOOR_LEAF_NATIVE_WIDTH * SCENE_SCALE;
const DOOR_HEIGHT = DOOR_LEAF_NATIVE_HEIGHT * SCENE_SCALE;

// A third of the way along the north wall rather than centred - on the
// player's left as they spawn facing it.
const DOOR_POSITION = RECEPTION_SIZE / 2 - RECEPTION_SIZE / 3;

// The reception room. Its north wall has the doorway into the shooting range.
export class Reception extends Room {
    constructor() {
        const wallFactory: WallFactory = (w, h, t, context) =>
            createTiledWall(wallSegmentModel, w, h, t, WALL_TILE_SIZE, undefined, context?.hole);

        super({
            size: RECEPTION_SIZE,
            skipWalls: ['north'],
            wallFactory,
            floorFactory: (w, d) => createTiledFloor(sidewalkTileModel, w, d),
            ceilingFactory: (w, d) => createTiledCeiling(suspendedCeilingModel, w, d),
        });

        const leafFactory = () => createGltfModel(doorLeafModel, SCENE_SCALE);
        this.addDoor(wallFactory, 'north', DOOR_POSITION, DOOR_WIDTH, DOOR_HEIGHT, leafFactory);

        // Backed against the north wall (the same wall as the door), directly
        // ahead of the spawn point, facing back into the room.
        const counter = createGltfModel(serviceCounterModel, SCENE_SCALE);
        const counterMarginFromWall = (COUNTER_NATIVE_DEPTH / 2) * SCENE_SCALE + 4;
        const counterZ = RECEPTION_SIZE / 2 - counterMarginFromWall;
        this.addFurniture(counter, new THREE.Vector3(0, 0, counterZ), Math.PI);

        // The scene's main directional light comes from almost directly
        // overhead, which grazes a vertical front face too shallowly to
        // shade the counter's embossed panel detail. This one sits off to
        // the side and in front, at an angle that actually rakes across
        // that face so the raised bumps catch light and cast their own
        // small shadow-side, instead of reading as flat under pure ambient.
        const counterLight = new THREE.PointLight(0xffffff, 800, 60, 2);
        counterLight.position.set(15, 12, counterZ - 20);
        this.add(counterLight);

        // Mounted on the north wall directly behind the counter.
        const displayBoard = createGltfModel(wallDisplayBoardModel, SCENE_SCALE);
        this.addFurniture(displayBoard, new THREE.Vector3(0, DISPLAY_BOARD_MOUNT_HEIGHT, RECEPTION_SIZE / 2 - 2), Math.PI);
    }
}
