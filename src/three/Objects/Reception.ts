import { Room } from './Room';
import { createTiledWall } from './GltfTile';
import wallSegmentModel from '../../assets/models/wall-segment.glb';

export const RECEPTION_SIZE = 100;
export const ROOM_HEIGHT = 120;

// The reception room. Its north wall has the doorway into the shooting range.
export class Reception extends Room {
    constructor() {
        super({
            size: RECEPTION_SIZE,
            height: ROOM_HEIGHT,
            doorWalls: ['north'],
            wallFactory: (w, h, t) => createTiledWall(wallSegmentModel, w, h, t),
        });
    }
}
