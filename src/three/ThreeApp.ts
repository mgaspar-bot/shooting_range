import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import type { Controls, Object3D, Scene } from 'three'
import { Ground } from './Objects/Ground'
import { Reception } from './Objects/Reception'


export class ThreeApp {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement

  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  private controls: PointerLockControls
  private devMode: boolean = false

  keys = {
        w: false,
        s: false,
        a: false,
        d: false
      }

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

    this.controls = new PointerLockControls(this.camera, document.body)
    this.setupPointerLock()
    

    if (initialScene) {
        this.scene.add(initialScene)
    } else {
        this.buildInitialScene()
    }



    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyW') this.keys.w = true
      if (event.code === 'KeyS') this.keys.s = true
      if (event.code === 'KeyA') this.keys.a = true
      if (event.code === 'KeyD') this.keys.d = true
    })

    window.addEventListener('keyup', (event) => {
      if (event.code === 'KeyW') this.keys.w = false
      if (event.code === 'KeyS') this.keys.s = false
      if (event.code === 'KeyA') this.keys.a = false
      if (event.code === 'KeyD') this.keys.d = false
    })


 


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

  private setupPointerLock() {
    const pointerLockControls = this.controls as PointerLockControls | undefined

    this.canvas.addEventListener('click', () => {
      if (!pointerLockControls) return
      if (!pointerLockControls.isLocked) {
        pointerLockControls.lock()
      }
    })
  }

  private animate = (time: DOMHighResTimeStamp) => {
    const delta = 0.0005

    if (this.keys.w) this.controls.moveForward(time*delta)
    if (this.keys.s) this.controls.moveForward(-time*delta)
    if (this.keys.a) this.controls.moveRight(-time*delta)
    if (this.keys.d) this.controls.moveRight(time*delta)

    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // aviam si el que vull es que la camera es mogui amb el mouse,
  // haig de trobar el punt del mouse, fer un vector cap allà i passar-li a lookAt
  
}

