import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import type { Controls, Object3D, Scene } from 'three'
import { Reception, RECEPTION_SIZE } from './Objects/Reception'
import { ShootingRange, SHOOTING_RANGE_SIZE } from './Objects/ShootingRange'
import { Floor } from './Objects/Floor'


export class ThreeApp {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement

  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  private controls: PointerLockControls
  private devMode: boolean = false

  private lastFrameTime = 0
  private readonly moveSpeed = 50 // units per second

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

    // The GLTF-based rooms/floor use a lit material so bevelled details
    // (like the groove around each floor tile) actually catch light.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(50, 100, 50)
    this.scene.add(sun)

    // Two rooms placed back to back along Z, sharing a doorway at the
    // boundary between them (Reception's north wall has the doorway,
    // ShootingRange's south wall is left open to match it).
    const reception = new Reception()
    reception.position.z = -RECEPTION_SIZE / 2
    this.scene.add( reception );

    const shootingRange = new ShootingRange()
    shootingRange.position.z = RECEPTION_SIZE / 2
    this.scene.add( shootingRange );

    const floor = new Floor(RECEPTION_SIZE, RECEPTION_SIZE + SHOOTING_RANGE_SIZE)
    this.scene.add( floor );

    this.camera.position.set(0, 10, -RECEPTION_SIZE / 2)
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
    const deltaSeconds = this.lastFrameTime === 0 ? 0 : (time - this.lastFrameTime) / 1000
    this.lastFrameTime = time

    const distance = this.moveSpeed * deltaSeconds

    if (this.keys.w) this.controls.moveForward(distance)
    if (this.keys.s) this.controls.moveForward(-distance)
    if (this.keys.a) this.controls.moveRight(-distance)
    if (this.keys.d) this.controls.moveRight(distance)

    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  
}

