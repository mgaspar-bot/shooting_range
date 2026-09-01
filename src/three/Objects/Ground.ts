import * as THREE from 'three';
import groundImage from '../../assets/cement-surface-with-rocks-moss.jpg'


export class Ground extends THREE.Mesh {
    constructor(maxAnisotropy?: number) {
        // Let's add the ground plane
        const groundGeometry = new THREE.PlaneGeometry( 1000, 1000 );
        
        // const groundMaterial = new THREE.MeshBasicMaterial( {color: 0x00fefe, side: THREE.DoubleSide, wireframe: true} );
        // Let's make the ground a grass material (find out how hahaha)
        // const light = new THREE.AmbientLight( 0xffffff, 1 ); // soft white light
        // scene.add( light );

        const groundTexture = new THREE.TextureLoader().load( groundImage);
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set( 20, 20 );
        groundTexture.anisotropy = maxAnisotropy || 1;
        groundTexture.colorSpace = THREE.SRGBColorSpace;
        const groundMaterial = new THREE.MeshBasicMaterial( {map: groundTexture, side: THREE.BackSide} );
                // const groundMaterial = new THREE.MeshBasicMaterial( {wireframe: true, side: THREE.BackSide} );


        super(groundGeometry, groundMaterial);
        this.rotation.x = Math.PI / 2; // rotate the ground plane to be horizontal
        this.position.y = -1; // position the ground plane below the cube
    }
}