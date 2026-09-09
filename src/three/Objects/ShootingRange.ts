import { Room } from './Room';
import { createTiledWall } from './GltfTile';
import { ROOM_HEIGHT } from './Reception';
import wallSegmentModel from '../../assets/models/wall-segment.glb';

export const SHOOTING_RANGE_SIZE = 100;

// The shooting range room. Its south wall is left open since it shares the
// doorway with the Reception room right next to it.
export class ShootingRange extends Room {
    constructor() {
        super({
            size: SHOOTING_RANGE_SIZE,
            height: ROOM_HEIGHT,
            skipWalls: ['south'],
            wallFactory: (w, h, t) => createTiledWall(wallSegmentModel, w, h, t),
        });
    }
}
