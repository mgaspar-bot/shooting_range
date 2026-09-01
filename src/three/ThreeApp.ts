import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'

import type { Object3D, Scene } from 'three'
import { Ground } from './Objects/Ground'
import { Reception } from './Objects/Reception'


export class ThreeApp {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement

  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  private controls?: OrbitControls
  private devMode: boolean = false

  constructor(private container: HTMLElement, initialScene?: Object3D) {
    // Initialize renderer and add it to the DOM
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    container.appendChild(this.renderer.domElement)
    this.canvas = this.renderer.domElement
    // Initialize scene and camera
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

    if (this.devMode)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)

    if (initialScene) {
        this.scene.add(initialScene)
    } else {
        this.buildInitialScene()
    }


 


    this.canvas.addEventListener('mousemove', this.setPickPosition)
    this.renderer.setAnimationLoop(this.animate)
  }

  private buildInitialScene(initialScene?: Object3D) {

    const maxAni = this.renderer.capabilities.getMaxAnisotropy()
    const ground = new Ground(maxAni)
    this.scene.add( ground );

    const reception = new Reception(maxAni)
    this.scene.add( reception );
    
    this.camera.position.y = 10
  }

  private animate = (time: DOMHighResTimeStamp) => {
    // update and render
    window.addEventListener("keydown", (event) => {
        switch (event.key) {
            case "w":
                this.camera.position.z -= 10/time
                break
            case "s":
                this.camera.position.z += 10/time
                break
            case "a":
                this.camera.position.x -= 10/time 
                break
            case "d":
                this.camera.position.x += 10/time
                break
        }    
    })
    const yaw = this.pickPosition.x * Math.PI / 3
    const pitch = this.pickPosition.y * Math.PI / 6
    const lookTarget = new THREE.Vector3(
      this.camera.position.x + Math.sin(yaw) * Math.cos(pitch),
      this.camera.position.y + Math.sin(pitch),
      this.camera.position.z - Math.cos(yaw) * Math.cos(pitch),
    )
    this.camera.lookAt(lookTarget)
    this.controls?.update()
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    this.canvas.removeEventListener('mousemove', this.setPickPosition)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getCanvasRelativePosition(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.canvas.width  / rect.width,
      y: (event.clientY - rect.top ) * this.canvas.height / rect.height,
    };
  }
 
  pickPosition = { x: 0, y: 0 }
  setPickPosition = (event: MouseEvent) => {
    const pos = this.getCanvasRelativePosition(event);
    this.pickPosition = {
      x: (pos.x / this.canvas.width ) *  2 - 1,
      y: (pos.y / this.canvas.height) * -2 + 1
    }
  }

  // aviam si el que vull es que la camera es mogui amb el mouse,
  // haig de trobar el punt del mouse, fer un vector cap allà i passar-li a lookAt
  
}

