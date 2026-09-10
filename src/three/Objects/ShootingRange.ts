import * as THREE from 'three';
import { Room } from './Room';
import { createTiledWall, createTiledFloor, createTiledCeiling, createGltfModel } from './GltfTile';
import { SCENE_SCALE } from '../scale';
import flagstoneFloorModel from '../../assets/models/flagstone-floor-tile-2a04ea.glb';
import alleyConcreteTileModel from '../../assets/models/alley-concrete-tile-56117b.glb';
import ceilingBayModuleModel from '../../assets/models/ceiling-bay-module-9c0661.glb';
import flipchartEaselModel from '../../assets/models/flipchart-easel-6d1844.glb';

export const SHOOTING_RANGE_SIZE = 100;
// flagstone-floor-tile-2a04ea.glb's native width (meters), at SCENE_SCALE -
// same as the wall model it replaces, so the tile pitch stays the same size.
const WALL_TILE_SIZE = 2 * SCENE_SCALE;

const FLIPCHART_SPACING = 12;
const FLIPCHART_Z = 30; // toward the back (north wall), away from the doorway

// The shooting range room. Its south wall is left open since it shares the
// doorway with the Reception room right next to it. Floor/ceiling are a
// rugged, industrial pair (worn alley concrete, an exposed structural
// ceiling bay); the walls are clad in the flagstone floor tile repurposed
// as cladding (reorientAsWall), for a rougher stone-wall look.
export class ShootingRange extends Room {
    constructor() {
        super({
            size: SHOOTING_RANGE_SIZE,
            skipWalls: ['south'],
            wallFactory: (w, h, t, context) =>
                createTiledWall(flagstoneFloorModel, w, h, t, WALL_TILE_SIZE, undefined, context?.hole, true),
            floorFactory: (w, d) => createTiledFloor(alleyConcreteTileModel, w, d),
            ceilingFactory: (w, d) => createTiledCeiling(ceilingBayModuleModel, w, d),
        });

        // Three flipcharts in a row, facing south toward the doorway.
        for (const x of [-FLIPCHART_SPACING, 0, FLIPCHART_SPACING]) {
            const flipchart = createGltfModel(flipchartEaselModel, SCENE_SCALE);
            this.addFurniture(flipchart, new THREE.Vector3(x, 0, FLIPCHART_Z), Math.PI);
        }
    }
}
