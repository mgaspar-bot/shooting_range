import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import type { Controls, Object3D, Scene } from 'three'
import { Reception, RECEPTION_SIZE } from './Objects/Reception'
import { ShootingRange } from './Objects/ShootingRange'
import { createGltfModel } from './Objects/GltfTile'
import { EYE_HEIGHT, SCENE_SCALE } from './scale'
import weaponModel from '../assets/models/weapon.glb'


export class ThreeApp {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement

  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  // The weapon viewmodel lives in its own scene, rendered in a second pass
  // after clearing the depth buffer - so it always draws in front of the
  // world (never clips through a wall the player is standing close to),
  // the same technique shooters use. It isn't parented to the camera;
  // each frame we copy the camera's transform onto it plus a fixed local
  // offset, which keeps it "stuck" to the same spot on screen.
  private weaponScene: THREE.Scene
  private weapon: THREE.Object3D
  private readonly weaponOffset = new THREE.Vector3(2.5, -2.2, -4.5)
  // weapon.glb's barrel points along its own local X, not -Z like the
  // camera's forward - this rotates it to point into the screen.
  private readonly weaponLocalRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))

  // A targeting grid (reticle), stuck to screen-centre the same way the
  // weapon is stuck to its corner - it lives in weaponScene too, so it
  // draws in that same depth-cleared second pass and is never hidden
  // behind world geometry. Unlike the weapon it has zero lateral offset,
  // so it always projects to the exact centre of the viewport regardless
  // of aspect ratio or FOV.
  private reticle: THREE.Object3D
  private readonly reticleOffset = new THREE.Vector3(0, 0, -15)

  // Recoil: a sudden upward kick on the weapon's rotation, applied on top
  // of its normal screen-stuck transform in animate(), decaying back to 0
  // each frame - purely a viewmodel effect, doesn't touch the camera/aim.
  private recoilKick = 0
  private readonly recoilKickAmount = 0.14 // radians, applied per shot
  private readonly recoilRecoverySpeed = 10 // per second, exponential decay rate

  private raycaster = new THREE.Raycaster()
  // Capped so firing a lot doesn't grow the scene forever - oldest marks
  // are removed first.
  private readonly bulletMarks: THREE.Object3D[] = []
  private readonly maxBulletMarks = 50
  // Created lazily on the first shot: browsers refuse to start audio
  // before a user gesture, and the pointer-lock click is that gesture.
  private audioContext: AudioContext | null = null

  // Shown until the player clicks to lock the pointer, and again if they
  // ever unlock (e.g. pressing Escape) - without it, that first click is
  // easy to miss as "nothing happened" rather than "now click to shoot".
  private overlay: HTMLDivElement

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
    // Rendering the weapon in a second pass (see animate) needs manual
    // control over clearing - autoClear would wipe the main scene's pixels
    // before the second render() call ever draws anything.
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)
    this.canvas = this.renderer.domElement
    // Initialize scene and camera
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

    // A separate scene/lights for the weapon viewmodel - it's rendered in
    // its own pass (see animate), so the main scene's lights don't reach it.
    this.weaponScene = new THREE.Scene()
    this.weaponScene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const weaponLight = new THREE.DirectionalLight(0xffffff, 1)
    weaponLight.position.set(1, 1, 1)
    this.weaponScene.add(weaponLight)
    this.weapon = createGltfModel(weaponModel, SCENE_SCALE)
    this.weaponScene.add(this.weapon)

    this.reticle = this.createReticle()
    this.weaponScene.add(this.reticle)

    this.overlay = this.createOverlay()
    container.appendChild(this.overlay)

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

    window.addEventListener('resize', this.handleResize)


 


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

    // Spawn at Reception's centre facing north (+z), toward the desk and
    // doorway wall, so both are in front of the player from the start.
    this.camera.position.set(0, EYE_HEIGHT, -RECEPTION_SIZE / 2)
    this.camera.rotation.y = Math.PI
  }

  // A simple crosshair: 4 short arms around a small centre gap, unlit
  // (MeshBasicMaterial) so it reads at a constant brightness regardless of
  // scene lighting, the way a HUD element should.
  private createReticle(): THREE.Object3D {
    const group = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const gap = 0.12
    const armLength = 0.22
    const barThickness = 0.03

    const hArmGeometry = new THREE.BoxGeometry(armLength, barThickness, 0.01)
    const leftArm = new THREE.Mesh(hArmGeometry, material)
    leftArm.position.x = -(gap / 2 + armLength / 2)
    const rightArm = new THREE.Mesh(hArmGeometry, material)
    rightArm.position.x = gap / 2 + armLength / 2

    const vArmGeometry = new THREE.BoxGeometry(barThickness, armLength, 0.01)
    const topArm = new THREE.Mesh(vArmGeometry, material)
    topArm.position.y = gap / 2 + armLength / 2
    const bottomArm = new THREE.Mesh(vArmGeometry, material)
    bottomArm.position.y = -(gap / 2 + armLength / 2)

    group.add(leftArm, rightArm, topArm, bottomArm)
    return group
  }

  // A "click to play" hint overlaid on the canvas, covering it until the
  // pointer locks - plain DOM, not part of the Three.js scene.
  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div')
    overlay.textContent = 'Click to play'
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: 'sans-serif',
      fontSize: '2rem',
      background: 'rgba(0, 0, 0, 0.4)',
      cursor: 'pointer',
      userSelect: 'none',
      pointerEvents: 'none', // clicks pass through to the canvas underneath
    })
    return overlay
  }

  private handleResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private setupPointerLock() {
    const pointerLockControls = this.controls as PointerLockControls | undefined

    this.canvas.addEventListener('click', () => {
      console.log('canvas click')
      if (!pointerLockControls) return
      if (!pointerLockControls.isLocked) {
        pointerLockControls.lock()
      } else {
        console.log('shooting')
        this.shoot()
      }
    })

    this.controls.addEventListener('lock', () => {
      this.overlay.style.display = 'none'
    })
    this.controls.addEventListener('unlock', () => {
      this.overlay.style.display = 'flex'
    })
  }

  private shoot(): void {
    this.recoilKick = this.recoilKickAmount
    this.playGunshot()
    this.spawnBulletMark()
  }

  // Synthesizes a short, percussive "bang" - filtered white noise with a
  // fast decay - instead of needing a sound asset for something this
  // simple. The filter sweeps from bright to muffled as it decays, which
  // reads as a sharp crack rather than a flat hiss.
  private playGunshot(): void {
    if (!this.audioContext) this.audioContext = new AudioContext()
    const ctx = this.audioContext
    const now = ctx.currentTime
    const duration = 0.25

    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(5000, now)
    filter.frequency.exponentialRampToValueAtTime(150, now + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)
  }

  // Raycasts from screen-centre (where the reticle sits) into the world
  // and leaves a small flat mark at the hit point, nudged off the surface
  // along its normal and facing outward - a bullet hole without needing a
  // decal texture.
  private spawnBulletMark(): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    const hit = this.raycaster
      .intersectObject(this.scene, true)
      .find((candidate) => !candidate.object.userData.isBulletMark)
    if (!hit || !hit.face) return

    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(0.25, 10),
      new THREE.MeshBasicMaterial({ color: 0x181510, side: THREE.DoubleSide }),
    )
    mark.userData.isBulletMark = true
    mark.position.copy(hit.point).addScaledVector(normal, 0.03)
    mark.lookAt(hit.point.clone().add(normal))
    this.scene.add(mark)

    this.bulletMarks.push(mark)
    if (this.bulletMarks.length > this.maxBulletMarks) {
      const oldest = this.bulletMarks.shift()
      if (oldest) this.scene.remove(oldest)
    }
  }

  private animate = (time: DOMHighResTimeStamp) => {
    const deltaSeconds = this.lastFrameTime === 0 ? 0 : (time - this.lastFrameTime) / 1000
    this.lastFrameTime = time

    const distance = this.moveSpeed * deltaSeconds

    if (this.keys.w) this.controls.moveForward(distance)
    if (this.keys.s) this.controls.moveForward(-distance)
    if (this.keys.a) this.controls.moveRight(-distance)
    if (this.keys.d) this.controls.moveRight(distance)

    // Recoil decays back toward 0 every frame regardless of whether a shot
    // just fired - exponential, so it snaps back quickly at first and eases
    // in at the tail instead of a linear, mechanical-looking recovery.
    this.recoilKick *= Math.exp(-this.recoilRecoverySpeed * deltaSeconds)

    // Stick the weapon to the same spot on screen: same rotation as the
    // camera, offset by a fixed amount in the camera's own local space.
    // Recoil adds an extra camera-space pitch-up (muzzle rises) and pulls
    // the weapon back toward the player slightly, on top of that.
    const recoilPitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.recoilKick, 0, 0))
    this.weapon.quaternion.copy(this.camera.quaternion).multiply(recoilPitch).multiply(this.weaponLocalRotation)
    const recoiledOffset = this.weaponOffset.clone()
    recoiledOffset.z += this.recoilKick * 3
    this.weapon.position.copy(this.camera.position).add(recoiledOffset.applyQuaternion(this.camera.quaternion))

    // Same trick, but dead ahead with no lateral offset - always screen-centre.
    this.reticle.quaternion.copy(this.camera.quaternion)
    this.reticle.position.copy(this.camera.position).add(this.reticleOffset.clone().applyQuaternion(this.camera.quaternion))

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.clearDepth()
    this.renderer.render(this.weaponScene, this.camera)
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize)
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.overlay.remove()
  }

  
}

