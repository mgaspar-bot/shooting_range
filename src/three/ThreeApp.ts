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
  // behind world geometry. Its screen position is computed each frame via
  // the same raycaster used to fire (see animate/spawnBulletMark), offset
  // by crosshairKick below - so at rest it sits dead-centre, and visually
  // tracks the actual point of aim once recoil starts pushing that off-centre.
  private reticle: THREE.Object3D
  private readonly reticleDistance = 15

  // Recoil: a sudden upward kick on the weapon's rotation, applied on top
  // of its normal screen-stuck transform in animate(), decaying back to 0
  // each frame - purely a viewmodel effect, doesn't touch the camera/aim.
  private recoilKick = 0
  private readonly recoilKickAmount = 0.14 // radians, applied per shot
  private readonly recoilRecoverySpeed = 10 // per second, exponential decay rate

  // Recoil's effect on actual aim: each shot nudges this NDC-space offset
  // (same units raycaster.setFromCamera expects) by a small random amount,
  // mostly upward like a real kick, with left/right randomness on top -
  // both the reticle and the shot's own raycast read this, so where the
  // crosshair visibly lands is exactly where the next bullet actually goes.
  // Decays back toward (0,0) the same way recoilKick does; capped so
  // holding the trigger down can't spray it off-screen indefinitely.
  private crosshairKick = new THREE.Vector2(0, 0)
  private readonly crosshairKickAmount = 0.025 // NDC units, added per shot
  private readonly maxCrosshairKick = 0.12 // NDC units
  private readonly crosshairRecoverySpeed = 6 // per second, exponential decay rate

  // Automatic fire: held down for as long as the mouse button is down
  // (see handleMouseDown/Up), gated on a fixed rounds-per-second rate
  // rather than firing once per frame so it's not tied to framerate.
  private isFiring = false
  private readonly fireRate = 10 // rounds per second
  private readonly fireInterval = 1 / this.fireRate
  private timeSinceLastShot = 0

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
    // Rendering the weapon in a second pass (see animate) needs manual
    // control over clearing - autoClear would wipe the main scene's pixels
    // before the second render() call ever draws anything.
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)
    this.canvas = this.renderer.domElement
    // Initialize scene and camera
    this.scene = new THREE.Scene()
    // Aspect is set properly by handleResize() below, once the renderer
    // and camera both exist - window.innerWidth/innerHeight can be 0 this
    // early in some embeds, and a 0 aspect permanently poisons the
    // projection matrix (NaN in, NaN forever after) with nothing to
    // self-correct it, silently breaking raycasting (e.g. bullet marks).
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
    this.handleResize()

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
    // Guard against a 0-sized viewport (can happen transiently in some
    // embeds, briefly right at startup): dividing by 0 gives a NaN aspect,
    // which poisons the projection matrix with no way to self-correct -
    // every raycast (bullet marks included) would silently stop hitting
    // anything, forever, even once the real size becomes available. Just
    // skip the update and keep whatever the last good size was.
    if (window.innerWidth <= 0 || window.innerHeight <= 0) return

    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return // left click only
    if (!this.controls.isLocked) return
    this.isFiring = true
    // Fire the first shot immediately rather than waiting out a full
    // fireInterval - matches how the single-click version used to feel.
    this.timeSinceLastShot = this.fireInterval
  }

  private handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return
    this.isFiring = false
  }

  private setupPointerLock() {
    const pointerLockControls = this.controls as PointerLockControls | undefined

    // Only the very first, lock-triggering click is a reliable 'click'
    // event once the pointer is locked - most browsers stop firing 'click'
    // on the locked element afterward. 'mousedown' keeps firing normally,
    // which is why it's the standard trigger for firing once locked (the
    // same pattern three.js's own PointerLockControls example uses).
    this.canvas.addEventListener('click', () => {
      if (!pointerLockControls) return
      if (!pointerLockControls.isLocked) {
        pointerLockControls.lock()
      }
    })

    document.addEventListener('mousedown', this.handleMouseDown)
    document.addEventListener('mouseup', this.handleMouseUp)

    this.controls.addEventListener('lock', () => {
      this.overlay.style.display = 'none'
    })
    this.controls.addEventListener('unlock', () => {
      this.overlay.style.display = 'flex'
      // Escape (or losing focus) unlocks without necessarily firing a
      // mouseup first - without this, holding the button through an
      // unlock would leave isFiring stuck true.
      this.isFiring = false
    })
  }

  private shoot(): void {
    this.recoilKick = this.recoilKickAmount

    // Mostly-upward kick (like a real gun's recoil) with left/right
    // randomness on top, accumulating across shots during a sustained
    // automatic burst - clampLength keeps it from growing without bound.
    this.crosshairKick.y += Math.random() * this.crosshairKickAmount
    this.crosshairKick.x += (Math.random() - 0.5) * this.crosshairKickAmount * 2
    this.crosshairKick.clampLength(0, this.maxCrosshairKick)

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
    // Fires toward the current (possibly recoil-kicked) aim point, not
    // dead-centre - matches where the reticle is actually drawn.
    this.raycaster.setFromCamera(this.crosshairKick, this.camera)
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
    // Clamped so a long stall (a slow frame, or a backgrounded/throttled
    // tab resuming after tens of seconds) can't be read as real elapsed
    // time - without this, the auto-fire loop below would try to "catch
    // up" every round that should've fired during the gap in one burst,
    // and movement/recoil would similarly jump or glitch.
    const rawDeltaSeconds = this.lastFrameTime === 0 ? 0 : (time - this.lastFrameTime) / 1000
    const deltaSeconds = Math.min(rawDeltaSeconds, 0.1)
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
    this.crosshairKick.multiplyScalar(Math.exp(-this.crosshairRecoverySpeed * deltaSeconds))

    // Automatic fire: while the trigger is held, fire at a fixed rate
    // rather than once per frame - a `while` (not `if`) catches up if a
    // slow frame skips past more than one fireInterval.
    if (this.isFiring && this.controls.isLocked) {
      this.timeSinceLastShot += deltaSeconds
      while (this.timeSinceLastShot >= this.fireInterval) {
        this.shoot()
        this.timeSinceLastShot -= this.fireInterval
      }
    } else {
      this.timeSinceLastShot = 0
    }

    // Stick the weapon to the same spot on screen: same rotation as the
    // camera, offset by a fixed amount in the camera's own local space.
    // Recoil adds an extra camera-space pitch-up (muzzle rises) and pulls
    // the weapon back toward the player slightly, on top of that.
    const recoilPitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.recoilKick, 0, 0))
    this.weapon.quaternion.copy(this.camera.quaternion).multiply(recoilPitch).multiply(this.weaponLocalRotation)
    const recoiledOffset = this.weaponOffset.clone()
    recoiledOffset.z += this.recoilKick * 3
    this.weapon.position.copy(this.camera.position).add(recoiledOffset.applyQuaternion(this.camera.quaternion))

    // Reticle tracks the actual (recoil-kicked) aim point: reuse the same
    // raycaster spawnBulletMark fires with, so the crosshair always shows
    // exactly where the next shot will go.
    this.raycaster.setFromCamera(this.crosshairKick, this.camera)
    this.reticle.quaternion.copy(this.camera.quaternion)
    this.reticle.position.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, this.reticleDistance)

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.clearDepth()
    this.renderer.render(this.weaponScene, this.camera)
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize)
    document.removeEventListener('mousedown', this.handleMouseDown)
    document.removeEventListener('mouseup', this.handleMouseUp)
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.overlay.remove()
  }

  
}

