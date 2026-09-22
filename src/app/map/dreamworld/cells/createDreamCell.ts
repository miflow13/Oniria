import * as THREE from 'three'
import type {SymbolCategory} from '@/types/dream'
import type {DreamProfile} from '../dreamProfile'
import type {DreamQualitySettings} from '../quality'

export type DreamCell = {
  portal: THREE.Sprite
  update: (time: number, focus: number) => void
  render: (renderer: THREE.WebGLRenderer) => void
  dispose: () => void
}

function makeCircleMask() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')

  if (context) {
    const gradient = context.createRadialGradient(128, 128, 54, 128, 128, 124)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(.72, 'rgba(255,255,255,.98)')
    gradient.addColorStop(.93, 'rgba(255,255,255,.72)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function glowMaterial(color: THREE.Color, opacity = 0.7) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

function standardMaterial(color: THREE.Color, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.3),
    emissiveIntensity: 0.72,
    roughness: 0.48,
    metalness: 0.08,
    transparent: opacity < 1,
    opacity,
  })
}

function buildCellWorld(
  scene: THREE.Scene,
  profile: DreamProfile,
  category: SymbolCategory,
  color: THREE.Color,
  detail: number,
  seed: number,
) {
  const group = new THREE.Group()
  scene.add(group)

  const disposables: Array<THREE.BufferGeometry | THREE.Material> = []
  const updaters: Array<(time: number, focus: number) => void> = []

  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = group,
  ) => {
    disposables.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    parent.add(mesh)
    return mesh
  }

  const phase = ((seed % 991) / 991) * Math.PI * 2

  const motifGroup = new THREE.Group()
  group.add(motifGroup)

  if (profile.motifs.house) {
    const body = addMesh(
      new THREE.BoxGeometry(.42, .34, .36),
      standardMaterial(color.clone().multiplyScalar(.5), .56 + profile.stability * .25),
      motifGroup,
    )
    body.position.set(-.34, -.24, -.18)

    const roof = addMesh(
      new THREE.ConeGeometry(.34, .26, 4),
      standardMaterial(color.clone().multiplyScalar(.38), .48 + profile.stability * .28),
      motifGroup,
    )
    roof.position.set(-.34, .055, -.18)
    roof.rotation.y = Math.PI / 4
  }

  if (profile.motifs.eye) {
    const eye = new THREE.Group()
    const sclera = addMesh(
      new THREE.SphereGeometry(.13, 20, 20),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), .65), .72),
      eye,
    )
    const iris = addMesh(
      new THREE.SphereGeometry(.055, 16, 16),
      standardMaterial(color, .9),
      eye,
    )
    iris.position.z = .11
    eye.position.set(.34, .28, -.35)
    motifGroup.add(eye)
    updaters.push((time) => {
      eye.rotation.y = Math.sin(time * .18 + phase) * .22
      sclera.scale.setScalar(1 + Math.sin(time * .52) * .025)
    })
  }

  if (profile.motifs.library) {
    const shelfMaterial = standardMaterial(color.clone().multiplyScalar(.36), .52)
    disposables.push(shelfMaterial)
    for (let row = 0; row < (detail > 1 ? 4 : 2); row += 1) {
      const shelf = addMesh(
        new THREE.BoxGeometry(.62, .035, .14),
        shelfMaterial,
        motifGroup,
      )
      shelf.position.set(.28, -.18 + row * .16, -.28 - row * .06)
      shelf.rotation.y = -.16
    }
  }

  if (profile.motifs.forest) {
    const treeMaterial = standardMaterial(color.clone().multiplyScalar(.3), .42)
    disposables.push(treeMaterial)
    for (let index = 0; index < (detail > 1 ? 7 : 4); index += 1) {
      const tree = addMesh(
        new THREE.ConeGeometry(.07, .32 + index * .018, 6),
        treeMaterial,
        motifGroup,
      )
      tree.position.set(
        -.45 + (index % 4) * .25,
        -.22 + (index % 2) * .04,
        -.4 - Math.floor(index / 4) * .16,
      )
    }
  }

  if (profile.motifs.stairs) {
    const stairMaterial = standardMaterial(color.clone().multiplyScalar(.48), .48)
    disposables.push(stairMaterial)
    const stairs = new THREE.Group()
    for (let index = 0; index < 7; index += 1) {
      const step = addMesh(
        new THREE.BoxGeometry(.24, .025, .09),
        stairMaterial,
        stairs,
      )
      step.position.set(index * .07, index * .055, -index * .045)
      step.rotation.y = index * .08
    }
    stairs.position.set(-.24, -.25, -.12)
    motifGroup.add(stairs)
  }

  if (profile.motifs.door) {
    const door = new THREE.Group()
    const material = standardMaterial(color.clone().multiplyScalar(.52), .68)
    disposables.push(material)
    const left = addMesh(new THREE.BoxGeometry(.025, .28, .03), material, door)
    const right = addMesh(new THREE.BoxGeometry(.025, .28, .03), material, door)
    const top = addMesh(new THREE.BoxGeometry(.2, .025, .03), material, door)
    left.position.x = -.09
    right.position.x = .09
    top.position.y = .13
    door.position.set(.4, -.08, -.15)
    motifGroup.add(door)
  }

  motifGroup.scale.setScalar(.9 + Math.min(profile.recurrence, 5) * .03)
  motifGroup.rotation.y = profile.lucid ? 0 : (1 - profile.stability) * .12


  const floor = addMesh(
    new THREE.CircleGeometry(1.25, 64),
    new THREE.MeshPhysicalMaterial({
      color: color.clone().multiplyScalar(0.13),
      emissive: color.clone().multiplyScalar(0.035),
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.18,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.52

  const horizon = addMesh(
    new THREE.TorusGeometry(1.08, 0.012, 6, 100),
    glowMaterial(color, 0.18),
  )
  horizon.rotation.x = Math.PI / 2
  horizon.position.y = -0.5

  if (category === 'place') {
    const water = addMesh(
      new THREE.CircleGeometry(0.9, 80),
      new THREE.MeshPhysicalMaterial({
        color: color.clone().multiplyScalar(0.36),
        emissive: color.clone().multiplyScalar(0.07),
        emissiveIntensity: 0.5,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.28,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      }),
    )
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.46

    const arch = addMesh(
      new THREE.TorusGeometry(0.44, 0.045, 10, 60, Math.PI),
      standardMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.12), 0.9),
    )
    arch.rotation.z = Math.PI
    arch.position.set(-0.12, -0.08, -0.18)

    const moon = addMesh(
      new THREE.SphereGeometry(0.13, 32, 32),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.68), 0.95),
    )
    moon.position.set(0.5, 0.48, -0.55)

    if (detail > 1) {
      for (let index = 0; index < 5; index += 1) {
        const pillar = addMesh(
          new THREE.BoxGeometry(0.08, 0.32 + index * 0.05, 0.08),
          standardMaterial(color.clone().multiplyScalar(0.5), 0.48),
        )
        pillar.position.set(
          -0.72 + index * 0.34,
          -0.36 + index * 0.025,
          -0.4 - Math.abs(index - 2) * 0.09,
        )
      }
    }

    updaters.push((time, focus) => {
      water.rotation.z = time * 0.055
      moon.position.y = 0.48 + Math.sin(time * 0.48 + phase) * 0.045
      moon.scale.setScalar(1 + focus * 0.2)
      arch.rotation.y = Math.sin(time * 0.22 + phase) * 0.08
    })
  } else if (category === 'person') {
    const silhouette = addMesh(
      new THREE.CapsuleGeometry(0.13, 0.44, 10, 18),
      standardMaterial(color.clone().multiplyScalar(0.68), 0.74),
    )
    silhouette.position.y = -0.05

    const head = addMesh(
      new THREE.SphereGeometry(0.13, 24, 24),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.25), 0.62),
    )
    head.position.y = 0.37

    const halo = addMesh(
      new THREE.TorusGeometry(0.43, 0.018, 8, 80),
      glowMaterial(color, 0.44),
    )
    halo.rotation.x = Math.PI / 2
    halo.position.y = 0.1

    updaters.push((time, focus) => {
      silhouette.rotation.y = Math.sin(time * 0.24 + phase) * 0.18
      halo.rotation.z = time * 0.14
      halo.scale.setScalar(1 + Math.sin(time * 0.7 + phase) * 0.06 + focus * 0.12)
      head.position.y = 0.37 + Math.sin(time * 0.55 + phase) * 0.025
    })
  } else if (category === 'object') {
    const crystal = addMesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshPhysicalMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.4),
        emissiveIntensity: 1.2,
        roughness: 0.12,
        metalness: 0.22,
        transmission: 0.22,
        transparent: true,
        opacity: 0.9,
      }),
    )
    crystal.position.y = 0.02

    const ringA = addMesh(
      new THREE.TorusGeometry(0.58, 0.014, 8, 90),
      glowMaterial(color, 0.5),
    )
    ringA.rotation.x = Math.PI / 2.6

    const ringB = addMesh(
      new THREE.TorusGeometry(0.48, 0.01, 8, 90),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.35), 0.34),
    )
    ringB.rotation.y = Math.PI / 2.4

    updaters.push((time, focus) => {
      crystal.rotation.x = time * 0.31
      crystal.rotation.y = -time * 0.46
      crystal.scale.setScalar(1 + focus * 0.12)
      ringA.rotation.z = time * 0.17
      ringB.rotation.x = time * 0.13
    })
  } else if (category === 'feeling') {
    const cloud = addMesh(
      new THREE.IcosahedronGeometry(0.52, 4),
      glowMaterial(color, 0.22),
    )
    cloud.scale.set(1.25, 0.78, 1)

    const heart = addMesh(
      new THREE.SphereGeometry(0.18, 32, 32),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.74),
    )

    if (detail > 1) {
      const ring = addMesh(
        new THREE.TorusKnotGeometry(0.36, 0.012, 100, 10, 2, 3),
        glowMaterial(color, 0.18),
      )
      updaters.push((time) => {
        ring.rotation.x = time * 0.08
        ring.rotation.y = -time * 0.11
      })
    }

    updaters.push((time, focus) => {
      cloud.rotation.y = time * 0.08
      cloud.scale.set(
        1.25 + Math.sin(time * 0.46 + phase) * 0.12,
        0.78 + Math.cos(time * 0.4 + phase) * 0.08,
        1 + Math.sin(time * 0.52 + phase) * 0.1,
      )
      heart.scale.setScalar(1 + Math.sin(time * 1.1 + phase) * 0.08 + focus * 0.14)
    })
  } else {
    const tunnel = new THREE.Group()
    group.add(tunnel)

    const streakCount = detail > 1 ? 13 : 8
    for (let index = 0; index < streakCount; index += 1) {
      const streak = addMesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.46 + index * 0.025, 6),
        glowMaterial(color, 0.46),
        tunnel,
      )
      const angle = (index / streakCount) * Math.PI * 2
      streak.position.set(
        Math.cos(angle) * 0.5,
        Math.sin(angle) * 0.34,
        -0.3 + (index % 4) * 0.12,
      )
      streak.rotation.z = angle + Math.PI / 2
    }

    const destination = addMesh(
      new THREE.TorusGeometry(0.24, 0.025, 8, 60),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.5), 0.68),
    )
    destination.position.z = -0.5

    updaters.push((time, focus) => {
      tunnel.rotation.z = time * 0.11
      tunnel.position.z = Math.sin(time * 0.42 + phase) * 0.08
      destination.scale.setScalar(1 + focus * 0.16 + Math.sin(time * 0.8) * 0.04)
    })
  }

  const dustCount = detail > 1 ? 90 : 48
  const dustPositions = new Float32Array(dustCount * 3)

  for (let index = 0; index < dustCount; index += 1) {
    const angle = index * 2.399963 + phase
    const radius = 0.28 + (index % 13) / 13 * 0.92
    dustPositions[index * 3] = Math.cos(angle) * radius
    dustPositions[index * 3 + 1] = -0.4 + ((index * 17) % dustCount) / dustCount * 1.35
    dustPositions[index * 3 + 2] = -0.7 + ((index * 29) % dustCount) / dustCount * 1.2
  }

  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const dustMaterial = new THREE.PointsMaterial({
    color: color.clone().lerp(new THREE.Color(0xffffff), 0.52),
    size: detail > 1 ? 0.018 : 0.014,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const dust = new THREE.Points(dustGeometry, dustMaterial)
  scene.add(dust)
  disposables.push(dustGeometry, dustMaterial)

  updaters.push((time, focus) => {
    dust.rotation.y = time * (0.035 + profile.wind * 0.04)
    dust.position.y =
      Math.sin(time * (0.16 + profile.wind * 0.12) + phase) *
      (0.035 + (1 - profile.stability) * 0.055)
    dustMaterial.opacity = 0.48 + focus * 0.24
    horizon.rotation.z = time * 0.03
  })

  return {
    update: (time: number, focus: number) => {
      group.rotation.y = Math.sin(time * 0.1 + phase) * 0.07
      updaters.forEach((update) => update(time, focus))
    },
    dispose: () => disposables.forEach((item) => item.dispose()),
  }
}

export function createDreamCell(
  profile: DreamProfile,
  category: SymbolCategory,
  color: THREE.Color,
  settings: DreamQualitySettings,
  seed: number,
  environmentMap: THREE.Texture | null = null,
): DreamCell {
  const scene = new THREE.Scene()
  const cold = new THREE.Color(0x02040c)
  const warm = new THREE.Color(0x16080f)
  scene.background = cold.clone().lerp(
    warm,
    Math.max(0, profile.warmth) * 0.3,
  )
  scene.environment = environmentMap
  scene.environmentIntensity = settings.environmentIntensity
  scene.fog = new THREE.FogExp2(
    color.clone().multiplyScalar(profile.lucid ? 0.07 : 0.12),
    Math.max(
      0.1,
      Math.min(
        0.38,
        profile.fogDensity * 2.2 + (category === 'feeling' ? 0.06 : 0),
      ),
    ),
  )

  const cellCamera = new THREE.PerspectiveCamera(46, 1, 0.04, 16)
  cellCamera.position.set(0, 0.08, 2.7)
  cellCamera.lookAt(0, 0, 0)

  scene.add(
    new THREE.AmbientLight(
      profile.lucid ? 0xa9e8ee : profile.warmth > 0.35 ? 0xc994b0 : 0x8394c9,
      profile.lucid ? 0.92 : 0.68,
    ),
  )

  const key = new THREE.PointLight(
    color.clone().lerp(new THREE.Color(0xffffff), 0.34),
    8,
    8,
    2,
  )
  key.position.set(-1.2, 1.5, 1.8)
  scene.add(key)

  const rim = new THREE.PointLight(color, 7, 7, 2)
  rim.position.set(1.6, -0.5, 0.8)
  scene.add(rim)

  const world = buildCellWorld(
    scene,
    profile,
    category,
    color,
    settings.miniWorldDetail,
    seed,
  )

  const resolution =
    settings.cellResolution >= 768
      ? 768
      : settings.cellResolution >= 512
        ? 512
        : settings.cellResolution >= 384
          ? 384
          : 256

  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  })
  target.texture.colorSpace = THREE.SRGBColorSpace

  const alphaMap = makeCircleMask()
  const portalMaterial = new THREE.SpriteMaterial({
    map: target.texture,
    alphaMap,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  })
  const portal = new THREE.Sprite(portalMaterial)
  portal.scale.set(1.02, 1.02, 1)
  portal.position.z = 0.04
  portal.renderOrder = 2

  return {
    portal,
    update: (time, focus) => {
      world.update(time, focus)
      key.intensity =
        5.2 +
        profile.mood * 0.55 +
        profile.recurrence * 0.3 +
        focus * 2.4
      rim.intensity =
        4.6 +
        (profile.lucid ? 1.4 : 0) +
        focus * 2.2
      portalMaterial.opacity += (0.84 + focus * 0.12 - portalMaterial.opacity) * 0.08
      portal.scale.setScalar(1.0 + focus * 0.08 + Math.sin(time * 0.62) * 0.012)
    },
    render: (renderer) => {
      const previousTarget = renderer.getRenderTarget()
      const previousColor = renderer.getClearColor(new THREE.Color())
      const previousAlpha = renderer.getClearAlpha()

      renderer.setRenderTarget(target)
      renderer.setClearColor(0x02040c, 1)
      renderer.clear(true, true, true)
      renderer.render(scene, cellCamera)
      renderer.setRenderTarget(previousTarget)
      renderer.setClearColor(previousColor, previousAlpha)
    },
    dispose: () => {
      world.dispose()
      alphaMap.dispose()
      portalMaterial.dispose()
      target.dispose()
    },
  }
}
