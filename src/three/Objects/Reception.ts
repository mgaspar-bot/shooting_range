import * as THREE from 'three';
import brickWallImage from '../../assets/detailed-red-brick-wall-background-texture-copy-space.jpg'


export class Reception extends THREE.Mesh {
    constructor(maxAni?: number) {
       // For now Reception is just a box
       const receptionGeometry = new THREE.BoxGeometry( 100, 200, 100 );
       const wallTexture = new THREE.TextureLoader().load( brickWallImage);
       wallTexture.wrapS = THREE.RepeatWrapping;
       wallTexture.wrapT = THREE.RepeatWrapping;
       wallTexture.repeat.set( 5, 5 );
       wallTexture.anisotropy = maxAni || 1;
       wallTexture.colorSpace = THREE.SRGBColorSpace;
       const receptionMaterial = new THREE.MeshBasicMaterial( {
        map: wallTexture,
        side: THREE.DoubleSide, 
        // wireframe: true
       });
       super(receptionGeometry, receptionMaterial);
       this.position.y = 5; // position the reception box above the ground
    }
}