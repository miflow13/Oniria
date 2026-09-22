import * as THREE from 'three'
import type {Dream} from '@/types/dream'
import type {DreamProfile} from '../dreamProfile'
import {profileAccent} from '../dreamProfile'
import type {DreamRelation} from '../dreamRelations'
import type {DreamQualitySettings} from '../quality'
import {
  createImpossibleSpace,
  type DiveInteraction,
} from './createImpossibleSpace'

export type DreamDive = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  accent: THREE.Color
  title: string
  dreamId: string
  depth: number
  secret: DreamProfile['secret']
  setLookTarget: (x: number, y: number) => void
  setTimeline: (progress: number) => void
  renderPreviews: (renderer: THREE.WebGLRenderer, time: number) => void
  pick: (ndcX: number, ndcY: number) => DiveInteraction
  update: (time: number, delta: number) => void
  resize: (aspect: number) => void
  dispose: () => void
}

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture

function seeded(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
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

function dreamMaterial(
  color: THREE.Color,
  solidity: number,
  options: {metal?: number; glow?: number} = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(options.glow ?? 0.12),
    emissiveIntensity: 0.55 + solidity * 0.45,
    roughness: 0.78 - solidity * 0.44,
    metalness: options.metal ?? 0.08,
    transparent: solidity < 0.98,
    opacity: 0.42 + solidity * 0.54,
  })
}

function createSoftCircleTexture(color: THREE.Color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    const css = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, css)
    gradient.addColorStop(.18, css)
    gradient.addColorStop(.5, css.replace('rgb', 'rgba').replace(')', ',.42)'))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createJournalFragment(
  text: string,
  accent: THREE.Color,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
    gradient.addColorStop(0, 'rgba(8,12,26,0)')
    gradient.addColorStop(.12, 'rgba(8,12,26,.62)')
    gradient.addColorStop(.88, 'rgba(8,12,26,.52)')
    gradient.addColorStop(1, 'rgba(8,12,26,0)')
    context.fillStyle = gradient
    context.fillRect(0, 48, canvas.width, 160)

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '500 38px system-ui, sans-serif'
    context.shadowBlur = 18
    context.shadowColor = `#${accent.getHexString()}`
    context.fillStyle = 'rgba(229,239,255,.82)'
    const clean = text.replace(/\s+/g, ' ').trim()
    context.fillText(
      clean.length > 78 ? `${clean.slice(0, 77)}…` : clean,
      canvas.width / 2,
      canvas.height / 2,
    )
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: .5,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(5.4, 1.35, 1)

  return {sprite, texture, material}
}

function createWaterMaterial(accent: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: {value: 0},
      uColor: {value: accent.clone()},
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vPosition;
      void main() {
        vec3 p = position;
        p.z += sin(p.x * 1.4 + uTime * .55) * .08;
        p.z += cos(p.y * 1.8 - uTime * .42) * .055;
        vPosition = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vPosition;
      void main() {
        float bands = .5 + .5 * sin((vPosition.x + vPosition.y) * 2.5);
        vec3 color = mix(uColor * .16, uColor * .62, bands);
        gl_FragColor = vec4(color, .52);
      }
    `,
  })
}

function addHouse(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  solidity: number,
) {
  const house = new THREE.Group()
  const bodyGeometry = new THREE.BoxGeometry(2.3, 1.55, 1.75)
  const bodyMaterial = dreamMaterial(accent.clone().multiplyScalar(.42), solidity, {glow: .08})
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = .78
  house.add(body)
  disposables.push(bodyGeometry, bodyMaterial)

  const roofGeometry = new THREE.ConeGeometry(1.85, 1.1, 4)
  const roofMaterial = dreamMaterial(accent.clone().multiplyScalar(.3), solidity, {metal: .02})
  const roof = new THREE.Mesh(roofGeometry, roofMaterial)
  roof.position.y = 2.05
  roof.rotation.y = Math.PI / 4
  house.add(roof)
  disposables.push(roofGeometry, roofMaterial)

  const doorGeometry = new THREE.PlaneGeometry(.55, .95)
  const doorMaterial = glowMaterial(accent.clone().lerp(new THREE.Color(0xffffff), .45), .24)
  const door = new THREE.Mesh(doorGeometry, doorMaterial)
  door.position.set(0, .55, .881)
  house.add(door)
  disposables.push(doorGeometry, doorMaterial)

  house.position.set(-2.6, 0, -7)
  root.add(house)
  return house
}

function addLibrary(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  solidity: number,
  detail: number,
) {
  const library = new THREE.Group()
  const shelfMaterial = dreamMaterial(accent.clone().multiplyScalar(.36), solidity, {metal: .05})
  disposables.push(shelfMaterial)

  const rows = detail > 1 ? 7 : 4
  for (let index = 0; index < rows; index += 1) {
    const geometry = new THREE.BoxGeometry(3.4, .12, .38)
    const shelf = new THREE.Mesh(geometry, shelfMaterial)
    shelf.position.set(
      (index % 2 === 0 ? -1 : 1) * (2.3 + (index % 3) * .65),
      .3 + index * .75,
      -5 - index * 1.1,
    )
    shelf.rotation.y = index % 2 === 0 ? .28 : -.28
    library.add(shelf)
    disposables.push(geometry)

    const bookCount = detail > 1 ? 11 : 6
    for (let book = 0; book < bookCount; book += 1) {
      const bookGeometry = new THREE.BoxGeometry(.14, .4 + (book % 3) * .05, .24)
      const bookMaterial = dreamMaterial(
        accent.clone().offsetHSL((book % 5) * .025, 0, (book % 4) * .025),
        Math.max(.28, solidity - .18),
        {glow: .05},
      )
      const mesh = new THREE.Mesh(bookGeometry, bookMaterial)
      mesh.position.set(
        shelf.position.x - 1.35 + book * (2.7 / bookCount),
        shelf.position.y + .24,
        shelf.position.z,
      )
      mesh.rotation.copy(shelf.rotation)
      library.add(mesh)
      disposables.push(bookGeometry, bookMaterial)
    }
  }

  root.add(library)
  return library
}

function addForest(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  solidity: number,
  seed: number,
  detail: number,
) {
  const forest = new THREE.Group()
  const count = detail > 1 ? 34 : 18
  const trunkMaterial = dreamMaterial(accent.clone().multiplyScalar(.2), solidity * .8, {glow: .03})
  const crownMaterial = dreamMaterial(accent.clone().multiplyScalar(.32), solidity * .65, {glow: .06})
  disposables.push(trunkMaterial, crownMaterial)

  for (let index = 0; index < count; index += 1) {
    const angle = seeded(seed + index, 4) * Math.PI * 2
    const radius = 3.4 + seeded(seed + index, 7) * 9
    const x = Math.cos(angle) * radius
    const z = -3 - Math.sin(angle) * radius - seeded(seed + index, 10) * 5
    const height = 1.8 + seeded(seed + index, 12) * 4.2

    const trunkGeometry = new THREE.CylinderGeometry(.06, .14, height, 7)
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
    trunk.position.set(x, height / 2 - .45, z)
    forest.add(trunk)
    disposables.push(trunkGeometry)

    const crownGeometry = new THREE.ConeGeometry(.55 + height * .07, 1.8 + height * .2, 7)
    const crown = new THREE.Mesh(crownGeometry, crownMaterial)
    crown.position.set(x, height + .15, z)
    forest.add(crown)
    disposables.push(crownGeometry)
  }

  root.add(forest)
  return forest
}

function addStairs(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  solidity: number,
) {
  const stairs = new THREE.Group()
  const material = dreamMaterial(accent.clone().multiplyScalar(.48), solidity, {glow: .08})
  disposables.push(material)

  for (let index = 0; index < 24; index += 1) {
    const geometry = new THREE.BoxGeometry(1.4, .13, .55)
    const step = new THREE.Mesh(geometry, material)
    const angle = index * .24
    step.position.set(
      3.6 + Math.cos(angle) * (1.5 + index * .06),
      .15 + index * .27,
      -4 - Math.sin(angle) * (1.5 + index * .08),
    )
    step.rotation.y = angle + .5
    stairs.add(step)
    disposables.push(geometry)
  }

  root.add(stairs)
  return stairs
}

function addDoor(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  position: THREE.Vector3,
  scale = 1,
) {
  const frame = new THREE.Group()
  const material = dreamMaterial(accent.clone().multiplyScalar(.48), .86, {glow: .13})
  const glow = glowMaterial(accent, .22)
  disposables.push(material, glow)

  const uprightGeometry = new THREE.BoxGeometry(.16 * scale, 2.4 * scale, .18 * scale)
  const topGeometry = new THREE.BoxGeometry(1.5 * scale, .16 * scale, .18 * scale)
  const planeGeometry = new THREE.PlaneGeometry(1.18 * scale, 2.1 * scale)
  const left = new THREE.Mesh(uprightGeometry, material)
  const right = new THREE.Mesh(uprightGeometry.clone(), material)
  const top = new THREE.Mesh(topGeometry, material)
  const portal = new THREE.Mesh(planeGeometry, glow)
  left.position.x = -.67 * scale
  right.position.x = .67 * scale
  top.position.y = 1.12 * scale
  portal.position.z = -.03

  frame.add(left, right, top, portal)
  frame.position.copy(position)
  root.add(frame)
  disposables.push(uprightGeometry, left.geometry, right.geometry, topGeometry, planeGeometry)
  return frame
}

function addEyeMoon(
  root: THREE.Group,
  disposables: Disposable[],
  accent: THREE.Color,
  position = new THREE.Vector3(3.4, 5.3, -13),
) {
  const eye = new THREE.Group()
  const scleraGeometry = new THREE.SphereGeometry(1.15, 48, 48)
  const scleraMaterial = glowMaterial(accent.clone().lerp(new THREE.Color(0xffffff), .7), .72)
  const sclera = new THREE.Mesh(scleraGeometry, scleraMaterial)
  eye.add(sclera)

  const irisGeometry = new THREE.SphereGeometry(.5, 40, 40)
  const irisMaterial = dreamMaterial(accent, .94, {glow: .4})
  const iris = new THREE.Mesh(irisGeometry, irisMaterial)
  iris.position.z = .94
  eye.add(iris)

  const pupilGeometry = new THREE.SphereGeometry(.2, 32, 32)
  const pupilMaterial = new THREE.MeshBasicMaterial({color: 0x010207})
  const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
  pupil.position.z = 1.36
  eye.add(pupil)

  eye.position.copy(position)
  root.add(eye)
  disposables.push(
    scleraGeometry,
    scleraMaterial,
    irisGeometry,
    irisMaterial,
    pupilGeometry,
    pupilMaterial,
  )
  return eye
}

function addSecret(
  root: THREE.Group,
  disposables: Disposable[],
  profile: DreamProfile,
  accent: THREE.Color,
) {
  if (!profile.secret) return null

  if (profile.secret === 'eclipse') {
    const group = new THREE.Group()
    const coronaGeometry = new THREE.SphereGeometry(1.5, 48, 48)
    const coronaMaterial = glowMaterial(accent.clone().lerp(new THREE.Color(0xffffff), .45), .48)
    const corona = new THREE.Mesh(coronaGeometry, coronaMaterial)
    group.add(corona)

    const darkGeometry = new THREE.SphereGeometry(1.28, 48, 48)
    const darkMaterial = new THREE.MeshBasicMaterial({color: 0x000107})
    const dark = new THREE.Mesh(darkGeometry, darkMaterial)
    dark.position.z = .16
    group.add(dark)

    group.position.set(-5.8, 6.8, -18)
    root.add(group)
    disposables.push(coronaGeometry, coronaMaterial, darkGeometry, darkMaterial)
    return group
  }

  if (profile.secret === 'black-monolith') {
    const geometry = new THREE.BoxGeometry(1.3, 8, .5)
    const material = new THREE.MeshStandardMaterial({
      color: 0x020205,
      emissive: accent.clone().multiplyScalar(.04),
      emissiveIntensity: .32,
      roughness: .08,
      metalness: .75,
    })
    const monolith = new THREE.Mesh(geometry, material)
    monolith.position.set(0, 3.6, -16)
    root.add(monolith)
    disposables.push(geometry, material)
    return monolith
  }

  if (profile.secret === 'impossible-door') {
    const door = addDoor(
      root,
      disposables,
      accent.clone().lerp(new THREE.Color(0xffffff), .25),
      new THREE.Vector3(-5.4, 2.3, -12),
      1.8,
    )
    door.rotation.z = .18
    return door
  }

  const animal = new THREE.Group()
  const material = glowMaterial(accent, .35)
  disposables.push(material)
  const points = [
    [-1.2, .1, 0],
    [-.6, .8, -.2],
    [0, .35, .1],
    [.65, .9, -.15],
    [1.2, .18, 0],
    [.3, -.7, .05],
    [-.4, -.8, -.1],
  ]
  const meshes: THREE.Mesh[] = []
  points.forEach(([x, y, z], index) => {
    const geometry = new THREE.SphereGeometry(.08 + (index % 2) * .025, 16, 16)
    const star = new THREE.Mesh(geometry, material)
    star.position.set(x, y, z)
    animal.add(star)
    meshes.push(star)
    disposables.push(geometry)
  })
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  )
  const lineMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: .22,
  })
  const line = new THREE.Line(lineGeometry, lineMaterial)
  animal.add(line)
  animal.position.set(4.6, 5.8, -14)
  animal.scale.setScalar(1.7)
  root.add(animal)
  disposables.push(lineGeometry, lineMaterial)
  return animal
}

export function createDreamDive(
  profile: DreamProfile,
  settings: DreamQualitySettings,
  seed: number,
  options: {
    currentDream: Dream
    dreams: Dream[]
    relations: DreamRelation[]
    depth?: number
    maxDepth?: number
  },
): DreamDive {
  const depth = options.depth ?? 0
  const maxDepth = options.maxDepth ?? 2
  const accent = new THREE.Color(profileAccent(profile))
  const scene = new THREE.Scene()

  const cold = new THREE.Color(0x050918)
  const warm = new THREE.Color(0x16080f)
  const background = cold.clone().lerp(warm, Math.max(0, profile.warmth) * .42)
  if (profile.lucid) background.lerp(new THREE.Color(0x06131c), .28)
  scene.background = background
  scene.fog = new THREE.FogExp2(background.clone().lerp(accent, .18), profile.fogDensity)

  const camera = new THREE.PerspectiveCamera(58, 1, .04, 80)
  camera.position.set(0, 1.4, 4.8)
  camera.lookAt(0, 1.1, -4)

  const root = new THREE.Group()
  scene.add(root)

  const disposables: Disposable[] = []
  const animated: Array<(time: number, delta: number) => void> = []

  const impossibleSpace = createImpossibleSpace({
    profile,
    currentDream: options.currentDream,
    dreams: options.dreams,
    relations: options.relations,
    settings,
    seed,
    depth,
    maxDepth,
  })
  scene.add(impossibleSpace.group)

  const ambient = new THREE.HemisphereLight(
    profile.lucid ? 0xbdeeff : 0x8790c5,
    profile.mood <= 2 ? 0x140d18 : 0x101521,
    profile.lucid ? 1.15 : .72,
  )
  scene.add(ambient)

  const moonLight = new THREE.DirectionalLight(
    profile.warmth > .35 ? 0xffc3d1 : profile.lucid ? 0xc5fbff : 0x9dace0,
    1.8 + profile.mood * .28,
  )
  moonLight.position.set(-5, 8, 5)
  scene.add(moonLight)

  const localLight = new THREE.PointLight(accent, 14 + profile.recurrence * 2, 22, 2)
  localLight.position.set(2, 3.5, -2)
  scene.add(localLight)

  const groundGeometry = new THREE.PlaneGeometry(44, 44, 48, 48)
  let waterMaterial: THREE.ShaderMaterial | null = null

  if (profile.motifs.water) {
    waterMaterial = createWaterMaterial(accent)
    const water = new THREE.Mesh(groundGeometry, waterMaterial)
    water.rotation.x = -Math.PI / 2
    water.position.y = -.05
    root.add(water)
    disposables.push(groundGeometry, waterMaterial)
    animated.push((time) => {
      if (waterMaterial) waterMaterial.uniforms.uTime.value = time
    })
  } else {
    const groundMaterial = dreamMaterial(
      accent.clone().multiplyScalar(.14),
      profile.stability,
      {glow: .02},
    )
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    root.add(ground)
    disposables.push(groundGeometry, groundMaterial)
  }

  if (profile.motifs.house) {
    const house = addHouse(root, disposables, accent, profile.stability)
    animated.push((time) => {
      house.position.y = Math.sin(time * .18 + seed) * .08
    })
  }

  if (profile.motifs.library) {
    const library = addLibrary(root, disposables, accent, profile.stability, settings.miniWorldDetail)
    animated.push((time) => {
      library.rotation.y = Math.sin(time * .06) * .04
    })
  }

  if (profile.motifs.forest) {
    addForest(root, disposables, accent, profile.stability, seed, settings.miniWorldDetail)
  }

  if (profile.motifs.stairs) {
    const stairs = addStairs(root, disposables, accent, profile.stability)
    animated.push((time) => {
      stairs.rotation.y = Math.sin(time * .04) * .07
    })
  }

  if (profile.motifs.corridor) {
    const corridor = new THREE.Group()
    const frameMaterial = dreamMaterial(
      accent.clone().multiplyScalar(.34),
      profile.stability * .82,
      {glow: .05},
    )
    disposables.push(frameMaterial)

    for (let index = 0; index < 12; index += 1) {
      const sideGeometry = new THREE.BoxGeometry(.12, 3.6, .12)
      const topGeometry = new THREE.BoxGeometry(3.4, .12, .12)
      const left = new THREE.Mesh(sideGeometry, frameMaterial)
      const right = new THREE.Mesh(sideGeometry.clone(), frameMaterial)
      const top = new THREE.Mesh(topGeometry, frameMaterial)
      left.position.set(-1.65, 1.8, -index * 1.7)
      right.position.set(1.65, 1.8, -index * 1.7)
      top.position.set(0, 3.55, -index * 1.7)
      corridor.add(left, right, top)
      disposables.push(sideGeometry, right.geometry, topGeometry)
    }

    corridor.position.set(0, 0, -3)
    root.add(corridor)
    animated.push((time) => {
      corridor.rotation.z = Math.sin(time * .055) * .012 * (1 - profile.stability)
    })
  }

  if (profile.motifs.object) {
    const artifactMaterial = new THREE.MeshPhysicalMaterial({
      color: accent.clone().lerp(new THREE.Color(0xffffff), .12),
      emissive: accent.clone().multiplyScalar(.25),
      emissiveIntensity: .78,
      roughness: .16,
      metalness: .24,
      transmission: .18,
      transparent: true,
      opacity: .82,
    })
    const artifactGeometry = new THREE.IcosahedronGeometry(.55, 1)
    const artifact = new THREE.Mesh(artifactGeometry, artifactMaterial)
    artifact.position.set(2.1, 2.4, -6.4)
    root.add(artifact)
    disposables.push(artifactGeometry, artifactMaterial)
    animated.push((time) => {
      artifact.rotation.x = time * .17
      artifact.rotation.y = -time * .24
      artifact.position.y = 2.4 + Math.sin(time * .35) * .18
    })
  }

  if (profile.motifs.door) {
    const door = addDoor(root, disposables, accent, new THREE.Vector3(4.8, 1.25, -8), 1.1)
    animated.push((time) => {
      door.rotation.y = Math.sin(time * .18) * .06
    })
  }

  if (profile.motifs.eye) {
    const eye = addEyeMoon(root, disposables, accent)
    animated.push((time) => {
      eye.rotation.y = Math.sin(time * .12) * .2
      eye.position.y = 5.3 + Math.sin(time * .2) * .16
    })
  } else if (profile.motifs.moon) {
    const moonTexture = createSoftCircleTexture(
      accent.clone().lerp(new THREE.Color(0xffffff), .72),
    )
    const moonMaterial = new THREE.SpriteMaterial({
      map: moonTexture,
      transparent: true,
      opacity: .72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const moon = new THREE.Sprite(moonMaterial)
    moon.position.set(4.5, 5.8, -16)
    moon.scale.set(4.2, 4.2, 1)
    scene.add(moon)
    disposables.push(moonTexture, moonMaterial)
  }

  if (profile.motifs.person) {
    const material = dreamMaterial(accent.clone().multiplyScalar(.5), profile.stability * .75, {glow: .08})
    disposables.push(material)
    const count = Math.max(1, Math.min(4, profile.categories.person || 1))
    for (let index = 0; index < count; index += 1) {
      const geometry = new THREE.CapsuleGeometry(.22, .95, 8, 14)
      const figure = new THREE.Mesh(geometry, material)
      figure.position.set(
        -1.8 + index * 1.2,
        .72,
        -5.2 - index * 1.7,
      )
      figure.rotation.y = Math.PI
      root.add(figure)
      disposables.push(geometry)
      animated.push((time) => {
        figure.position.y = .72 + Math.sin(time * .28 + index) * .055
      })
    }
  }

  if (profile.motifs.flying) {
    const cloudTexture = createSoftCircleTexture(new THREE.Color(0x9ec5e7))
    const cloudMaterial = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: .08 + profile.stability * .05,
      depthWrite: false,
    })
    disposables.push(cloudTexture, cloudMaterial)

    const clouds: THREE.Sprite[] = []
    const count = settings.miniWorldDetail > 1 ? 22 : 12
    for (let index = 0; index < count; index += 1) {
      const cloud = new THREE.Sprite(cloudMaterial)
      cloud.position.set(
        (seeded(seed + index, 2) - .5) * 20,
        1.4 + seeded(seed + index, 3) * 5,
        -4 - seeded(seed + index, 5) * 24,
      )
      const scale = 2 + seeded(seed + index, 7) * 4
      cloud.scale.set(scale * 1.7, scale, 1)
      scene.add(cloud)
      clouds.push(cloud)
    }
    animated.push((time, delta) => {
      clouds.forEach((cloud, index) => {
        cloud.position.x += delta * (.08 + profile.wind * .12) * (index % 2 ? 1 : -1)
        if (cloud.position.x > 12) cloud.position.x = -12
        if (cloud.position.x < -12) cloud.position.x = 12
      })
    })
  }

  const secret = addSecret(root, disposables, profile, accent)
  if (secret) {
    animated.push((time) => {
      secret.rotation.y = Math.sin(time * .045) * .12
      secret.position.y += Math.sin(time * .12) * .0006
    })
  }

  const particleCount =
    settings.particleCount * (settings.miniWorldDetail > 1 ? 13 : 8)
  const particlePositions = new Float32Array(particleCount * 3)
  const originalParticlePositions = new Float32Array(particleCount * 3)

  for (let index = 0; index < particleCount; index += 1) {
    const x = (seeded(seed + index, 11) - .5) * 32
    const y = seeded(seed + index, 13) * 10
    const z = -2 - seeded(seed + index, 17) * 36
    particlePositions[index * 3] = x
    particlePositions[index * 3 + 1] = y
    particlePositions[index * 3 + 2] = z
    originalParticlePositions[index * 3] = x
    originalParticlePositions[index * 3 + 1] = y
    originalParticlePositions[index * 3 + 2] = z
  }

  const particleGeometry = new THREE.BufferGeometry()
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
  const particleMaterial = new THREE.PointsMaterial({
    color: accent.clone().lerp(new THREE.Color(0xffffff), profile.lucid ? .65 : .32),
    size: profile.lucid ? .028 : .038,
    transparent: true,
    opacity: profile.lucid ? .7 : .5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const weatherParticles = new THREE.Points(particleGeometry, particleMaterial)
  scene.add(weatherParticles)
  disposables.push(particleGeometry, particleMaterial)

  const decayMaterial = dreamMaterial(
    accent.clone().multiplyScalar(.22),
    Math.max(.12, profile.stability - .35),
    {glow: .02},
  )
  disposables.push(decayMaterial)
  const decayFragments: THREE.Mesh[] = []
  const fragmentCount = Math.round(profile.decay * 22 * settings.miniWorldDetail)
  for (let index = 0; index < fragmentCount; index += 1) {
    const geometry =
      index % 2
        ? new THREE.TetrahedronGeometry(.12 + seeded(seed + index, 21) * .42, 0)
        : new THREE.BoxGeometry(.18, .18 + seeded(seed + index, 23) * .45, .12)
    const fragment = new THREE.Mesh(geometry, decayMaterial)
    fragment.position.set(
      (seeded(seed + index, 25) - .5) * 16,
      .5 + seeded(seed + index, 27) * 6,
      -4 - seeded(seed + index, 29) * 22,
    )
    root.add(fragment)
    decayFragments.push(fragment)
    disposables.push(geometry)
  }

  const lightShaftGeometry = new THREE.CylinderGeometry(.2, 2.6, 12, 32, 1, true)
  const lightShaftMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: profile.lucid ? .055 : .028,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const lightShaft = new THREE.Mesh(lightShaftGeometry, lightShaftMaterial)
  lightShaft.position.set(-3.8, 5.5, -8)
  lightShaft.rotation.z = -.32
  scene.add(lightShaft)
  disposables.push(lightShaftGeometry, lightShaftMaterial)

  const journalFragments = profile.body
    .split(/[.!?]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 12)
    .slice(0, settings.miniWorldDetail > 1 ? 6 : 3)
    .map((fragment, index) => {
      const item = createJournalFragment(fragment, accent)
      item.sprite.position.set(
        (seeded(seed + index, 31) - .5) * 12,
        1.3 + seeded(seed + index, 32) * 4.5,
        -5 - seeded(seed + index, 33) * 18,
      )
      item.sprite.rotation.z = (seeded(seed + index, 34) - .5) * .12
      scene.add(item.sprite)
      disposables.push(item.texture, item.material)
      return item
    })

  let lookX = 0
  let lookY = 0
  let currentYaw = 0
  let currentPitch = 0
  let temporalProgress = 1
  let entryTime = 0

  return {
    scene,
    camera,
    accent,
    title: profile.title,
    dreamId: profile.dreamId,
    depth,
    secret: profile.secret,
    setLookTarget: (x, y) => {
      lookX = THREE.MathUtils.clamp(x, -1, 1)
      lookY = THREE.MathUtils.clamp(y, -1, 1)
    },
    setTimeline: (progress) => {
      temporalProgress = THREE.MathUtils.clamp(progress, 0, 1)
    },
    renderPreviews: (renderer, time) => {
      impossibleSpace.renderPreviews(renderer, time)
    },
    pick: (ndcX, ndcY) => impossibleSpace.pick(camera, ndcX, ndcY),
    resize: (aspect) => {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    },
    update: (time, delta) => {
      entryTime += delta
      const particleAttribute = particleGeometry.getAttribute('position') as THREE.BufferAttribute
      const particleArray = particleAttribute.array as Float32Array
      const fallDirection = profile.motifs.falling ? -1 : profile.mood >= 4 ? 1 : .22
      const verticalSpeed = (.12 + profile.wind * .28) * fallDirection

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3
        particleArray[offset] += delta * profile.wind * (index % 2 ? .13 : -.09)
        particleArray[offset + 1] += delta * verticalSpeed
        particleArray[offset + 2] += delta * (profile.motifs.flying ? .2 : .04)

        if (particleArray[offset + 1] > 10) particleArray[offset + 1] = 0
        if (particleArray[offset + 1] < 0) particleArray[offset + 1] = 10
        if (particleArray[offset + 2] > -1) {
          particleArray[offset + 2] = originalParticlePositions[offset + 2] - 30
        }
      }
      particleAttribute.needsUpdate = true

      animated.forEach((update) => update(time, delta))

      decayFragments.forEach((fragment, index) => {
        fragment.rotation.x += delta * (.05 + index * .001)
        fragment.rotation.y -= delta * (.04 + index * .001)
        fragment.position.y += Math.sin(time * .16 + index) * delta * .03

        const effectiveDecay = profile.decay * temporalProgress
        const threshold = (index + 1) / Math.max(1, decayFragments.length)
        fragment.visible = threshold <= effectiveDecay + .12
        const scale = .25 + effectiveDecay * .9
        fragment.scale.lerp(new THREE.Vector3(scale, scale, scale), .06)
      })

      journalFragments.forEach((fragment, index) => {
        fragment.sprite.position.y +=
          Math.sin(time * .11 + index * 1.4) * delta * .035
        fragment.sprite.position.x +=
          Math.cos(time * .07 + index) * delta * .018
        fragment.material.opacity =
          (.16 + (1 - profile.decay * temporalProgress) * .42) *
          (profile.lucid ? .86 : .64)
      })

      impossibleSpace.update(
        time,
        delta,
        temporalProgress,
        lookX,
        lookY,
      )

      const lookStrength = profile.lucid ? .28 : .48
      currentYaw = THREE.MathUtils.lerp(currentYaw, -lookX * lookStrength, .055)
      currentPitch = THREE.MathUtils.lerp(
        currentPitch,
        lookY * lookStrength * .62,
        .055,
      )

      const breathing = profile.lucid
        ? Math.sin(time * .42) * .004
        : Math.sin(time * .34) * (.018 + (1 - profile.stability) * .018)

      const entryProgress = Math.min(1, entryTime / 4.2)
      const entryEase = 1 - Math.pow(1 - entryProgress, 3)
      const secretBias = profile.secret ? .13 * (1 - entryEase) : 0
      const portalBias = options.relations.length ? -.18 * (1 - entryEase) : 0

      camera.position.x =
        Math.sin(time * .065) * .18 * (profile.lucid ? .35 : 1) +
        currentYaw * .24 +
        secretBias
      camera.position.y =
        1.4 +
        breathing +
        Math.sin(entryProgress * Math.PI) * .12
      camera.position.z =
        THREE.MathUtils.lerp(6.8, 4.8, entryEase) +
        Math.cos(time * .052) * .12
      camera.rotation.order = 'YXZ'
      camera.rotation.y =
        currentYaw +
        portalBias +
        (profile.secret ? .08 * (1 - entryEase) : 0)
      camera.rotation.x = currentPitch + breathing * .15

      if (scene.fog instanceof THREE.FogExp2) {
        const weatherPulse =
          Math.sin(time * .13) * .005 * (1 - profile.stability)
        const historicalRepair = 1 - temporalProgress
        const lucidClarity = profile.lucid ? .72 : 1
        scene.fog.density = Math.max(
          .006,
          (profile.fogDensity + weatherPulse) *
            lucidClarity *
            (1 - historicalRepair * .28),
        )
      }

      lightShaft.material = lightShaftMaterial
      lightShaftMaterial.opacity =
        (profile.lucid ? .05 : .024) +
        Math.max(0, Math.sin(time * .2)) * .012

      root.rotation.y =
        Math.sin(time * .025) *
        .012 *
        (1 - profile.stability) *
        (profile.lucid ? .22 : 1)
    },
    dispose: () => {
      impossibleSpace.dispose()
      journalFragments.forEach((fragment) => scene.remove(fragment.sprite))
      disposables.forEach((item) => item.dispose())
    },
  }
}
