import * as THREE from 'three';

export type RoomSide = 'north' | 'south' | 'east' | 'west';

export type WallFactory = (width: number, height: number, thickness: number) => THREE.Object3D;

export interface RoomOptions {
    size: number;
    height: number;
    thickness?: number;
    doorWidth?: number;
    // Walls that should have a doorway gap in the middle.
    doorWalls?: RoomSide[];
    // Walls to leave out entirely (e.g. a wall shared with a neighbouring room).
    skipWalls?: RoomSide[];
    // Builds a single wall segment.
    wallFactory: WallFactory;
}

// A simple square room built out of four wall segments, grouped with THREE.Group
// so it can be moved/rotated as a single unit. North/south walls run along X
// (at +-size/2 on Z), east/west walls run along Z (at +-size/2 on X).
export class Room extends THREE.Group {
    constructor(options: RoomOptions) {
        super();

        const {
            size,
            height,
            thickness = 4,
            doorWidth = 30,
            doorWalls = [],
            skipWalls = [],
            wallFactory,
        } = options;
        const half = size / 2;

        const sides: RoomSide[] = ['north', 'south', 'east', 'west'];
        for (const side of sides) {
            if (skipWalls.includes(side)) continue;

            const horizontal = side === 'north' || side === 'south';
            const z = side === 'north' ? half : side === 'south' ? -half : 0;
            const x = side === 'east' ? half : side === 'west' ? -half : 0;

            if (!doorWalls.includes(side)) {
                const wall = wallFactory(size, height, thickness);
                if (!horizontal) wall.rotation.y = Math.PI / 2;
                wall.position.set(x, height / 2, z);
                this.add(wall);
                continue;
            }

            // Split the wall in two, leaving a doorway-width gap in the middle.
            const segmentWidth = (size - doorWidth) / 2;
            const offset = doorWidth / 2 + segmentWidth / 2;
            const left = wallFactory(segmentWidth, height, thickness);
            const right = wallFactory(segmentWidth, height, thickness);

            if (horizontal) {
                left.position.set(-offset, height / 2, z);
                right.position.set(offset, height / 2, z);
            } else {
                left.rotation.y = Math.PI / 2;
                right.rotation.y = Math.PI / 2;
                left.position.set(x, height / 2, -offset);
                right.position.set(x, height / 2, offset);
            }

            this.add(left, right);
        }
    }
}
