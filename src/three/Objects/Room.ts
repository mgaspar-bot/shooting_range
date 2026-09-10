import * as THREE from 'three';
import { SCENE_SCALE } from '../scale';

export type RoomSide = 'north' | 'south' | 'east' | 'west';

export interface WallHole {
    x: number; // local x, centered on the wall like `width` below
    y: number; // height above the floor
    width: number;
    height: number;
}

// `context.hole`, when given, tells a wallFactory to build the wall exactly
// as it would without a door and then punch a doorway-shaped gap into it -
// see Room.addDoor and GltfTile's createTiledWall for the reasoning.
export type WallFactory = (
    width: number,
    height: number,
    thickness: number,
    context?: { hole?: WallHole },
) => THREE.Object3D;
export type SurfaceFactory = (width: number, depth: number) => THREE.Object3D;

export const DEFAULT_ROOM_HEIGHT = 80;
// A generic doorway's proportions (width x height, in meters) at this
// scene's scale - used when addDoor isn't given an exact size to match a
// specific door leaf model.
const DEFAULT_DOOR_WIDTH = 0.9 * SCENE_SCALE;
const DEFAULT_DOOR_HEIGHT = 2.1 * SCENE_SCALE;

export interface RoomOptions {
    size: number;
    height?: number;
    thickness?: number;
    // Walls to leave out entirely - either a wall shared with a neighbouring
    // room, or one a later addDoor() call will fill in with a doorway.
    skipWalls?: RoomSide[];
    // Builds a single wall segment.
    wallFactory: WallFactory;
    // Builds the ground/ceiling surface; omit to leave either one out.
    floorFactory?: SurfaceFactory;
    ceilingFactory?: SurfaceFactory;
}

// The Y rotation that turns a wall panel's local -Z (its "front", the
// direction it's meant to be viewed from) to face into the room for each
// side. A double-sided-looking model like the original wall-segment hides
// this - either face looks fine - but a genuinely single-sided one (a
// reoriented floor tile, a door leaf) needs the actual correct sign per
// side, not just "no rotation for north/south, +90 for east/west": south
// needs 180 (its inward direction is the mirror of north's), and east/west
// need opposite signs of 90 (their inward directions are mirrors of each
// other too), not the same rotation.
const WALL_ROTATION: Record<RoomSide, number> = {
    north: 0,
    south: Math.PI,
    east: Math.PI / 2,
    west: -Math.PI / 2,
};

// A simple square room built out of four wall segments, grouped with THREE.Group
// so it can be moved/rotated as a single unit. North/south walls run along X
// (at +-size/2 on Z), east/west walls run along Z (at +-size/2 on X).
export class Room extends THREE.Group {
    protected readonly size: number;
    protected readonly height: number;
    protected readonly thickness: number;

    constructor(options: RoomOptions) {
        super();

        const {
            size,
            height = DEFAULT_ROOM_HEIGHT,
            thickness = 4,
            skipWalls = [],
            wallFactory,
            floorFactory,
            ceilingFactory,
        } = options;
        this.size = size;
        this.height = height;
        this.thickness = thickness;

        const half = size / 2;
        const sides: RoomSide[] = ['north', 'south', 'east', 'west'];
        for (const side of sides) {
            if (skipWalls.includes(side)) continue;

            const z = side === 'north' ? half : side === 'south' ? -half : 0;
            const x = side === 'east' ? half : side === 'west' ? -half : 0;

            const wall = wallFactory(size, height, thickness);
            wall.rotation.y = WALL_ROTATION[side];
            wall.position.set(x, height / 2, z);
            this.add(wall);
        }

        if (floorFactory) {
            const floor = floorFactory(size, size);
            floor.position.y = 0;
            this.add(floor);
        }

        if (ceilingFactory) {
            const ceiling = ceilingFactory(size, size);
            ceiling.position.y = height;
            this.add(ceiling);
        }
    }

    // Places a standalone piece (furniture, props) at a position local to
    // the room. Unlike walls/floor/ceiling, furniture placement is a
    // one-off decision specific to each room, so subclasses call this
    // directly in their own constructor rather than describing it in
    // RoomOptions.
    protected addFurniture(model: THREE.Object3D, position: THREE.Vector3, rotationY = 0): void {
        model.position.copy(position);
        model.rotation.y = rotationY;
        this.add(model);
    }

    // Cuts a doorway into a wall the constructor left out (pass that side
    // in skipWalls), and, if given, places a door leaf filling it. Builds
    // the wall with wallFactory exactly as if it had no door, passing the
    // opening as a hole for the factory to punch out - so the tiling
    // pattern is identical to a plain wall's, not a separately-scaled
    // jamb/header assembly. `position` is the door's centre, offset from
    // the wall's own centre along its length (positive = toward the wall's
    // +x end for north/south, +z end for east/west).
    protected addDoor(
        wallFactory: WallFactory,
        side: RoomSide,
        position = 0,
        width = DEFAULT_DOOR_WIDTH,
        doorHeight = DEFAULT_DOOR_HEIGHT,
        leafFactory?: SurfaceFactory,
    ): void {
        const half = this.size / 2;
        const horizontal = side === 'north' || side === 'south';
        const z = side === 'north' ? half : side === 'south' ? -half : 0;
        const x = side === 'east' ? half : side === 'west' ? -half : 0;

        const wall = wallFactory(this.size, this.height, this.thickness, {
            hole: { x: position, y: 0, width, height: doorHeight },
        });
        wall.rotation.y = WALL_ROTATION[side];
        wall.position.set(x, this.height / 2, z);
        this.add(wall);

        if (leafFactory) {
            const leaf = leafFactory(width, doorHeight);
            leaf.rotation.y = WALL_ROTATION[side];
            if (horizontal) {
                leaf.position.set(position, 0, z);
            } else {
                leaf.position.set(x, 0, position);
            }
            this.add(leaf);
        }
    }
}
