import * as THREE from 'three';
import { createTiledFloor } from './GltfTile';
import sidewalkTileModel from '../../assets/models/sidewalk-tile.glb';

// The interior floor covering both rooms, built from the sidewalk-tile model.
export class Floor extends THREE.Group {
    constructor(width: number, depth: number) {
        super();
        this.add(createTiledFloor(sidewalkTileModel, width, depth));
    }
}
