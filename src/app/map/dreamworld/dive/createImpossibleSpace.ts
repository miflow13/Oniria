import * as THREE from 'three'
import type {Dream, SymbolCategory} from '@/types/dream'
import {createDreamCell, type DreamCell} from '../cells/createDreamCell'
import {createDreamProfile, profileAccent, type DreamProfile} from '../dreamProfile'
import {
  chooseDreamMutation,
  dreamRecurrence,
  type DreamMutation,
  type DreamRelation,
} from '../dreamRelations'
import type {DreamQualitySettings} from '../quality'

export type DiveInteraction =
  | {
      kind: 'portal' | 'recursive-cell'
      dreamId: string
      title: string
      depth: number
    }
  | null

export type ImpossibleSpace = {
  group: THREE.Group
  update: (
    time: number,
    delta: number,
    temporalProgress: number,
    lookX: number,
    lookY: number,
  ) => void
  renderPreviews: (renderer: THREE.WebGLRenderer, time: number) => void
  pick: (
    camera: THREE.PerspectiveCamera,
    ndcX: number,
    ndcY: number,
  ) => DiveInteraction
  dispose: () => void
}

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture

const CATEGORY_COLORS: Record<SymbolCategory, number> = {
  person: 0xd9a7ff,
  place: 0x84dfd7,
  object: 0x82b8ff,
  feeling: 0xf0a4c7,
  action: 0xc9a8ff,
}

function seeded(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function categoryForDream(dream: Dream): SymbolCategory {
  const symbols = dream.symbols ?? []
  const counts: Record<SymbolCategory, number> = {
    person: 0,
    place: 0,
    object: 0,
    feeling: 0,
    action: 0,
  }
  symbols.forEach((symbol) => {
    counts[symbol.category] += 1
  })
  return (Object.keys(counts) as SymbolCategory[]).sort(
    (a, b) => counts[b] - counts[a],
  )[0] ?? 'place'
}

function impossibleMaterial(color: THREE.Color, opacity = 0.46) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(.09),
    emissiveIntensity: .52,
    roughness: .62,
    metalness: .12,
    transparent: true,
    opacity,
  })
}

function glowMaterial(color: THREE.Color, opacity = .42) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

export function createImpossibleSpace({
  profile,
  currentDream,
  dreams,
  relations,
  settings,
  seed,
  depth,
  maxDepth,
}: {
  profile: DreamProfile
  currentDream: Dream
  dreams: Dream[]
  relations: DreamRelation[]
  settings: DreamQualitySettings
  seed: number
  depth: number
  maxDepth: number
}): ImpossibleSpace {
  const group = new THREE.Group()
  const accent = new THREE.Color(profileAccent(profile))
  const disposables: Disposable[] = []
  const previews: Array<{
    cell: DreamCell
    dream: Dream
    interaction: Exclude<DiveInteraction, null>
    object: THREE.Object3D
  }> = []
  const pickables: THREE.Object3D[] = []
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  const primaryRelation = relations[0] ?? null
  const mutation: DreamMutation = chooseDreamMutation(
    currentDream,
    primaryRelation,
    profile.recurrence,
  )

  // Endless looping corridor: frames recycle through Z so perspective never reaches the end.
  const corridor = new THREE.Group()
  const corridorMaterial = impossibleMaterial(
    accent.clone().multiplyScalar(.34),
    .3 + profile.stability * .35,
  )
  disposables.push(corridorMaterial)
  const corridorFrames: THREE.Group[] = []
  const corridorCount = settings.miniWorldDetail > 1 ? 18 : 10

  for (let index = 0; index < corridorCount; index += 1) {
    const frame = new THREE.Group()
    const sideGeometry = new THREE.BoxGeometry(.1, 3.4, .1)
    const topGeometry = new THREE.BoxGeometry(3.2, .1, .1)
    const left = new THREE.Mesh(sideGeometry, corridorMaterial)
    const right = new THREE.Mesh(sideGeometry.clone(), corridorMaterial)
    const top = new THREE.Mesh(topGeometry, corridorMaterial)
    left.position.set(-1.55, 1.7, 0)
    right.position.set(1.55, 1.7, 0)
    top.position.set(0, 3.35, 0)
    frame.add(left, right, top)
    frame.position.z = -6 - index * 1.8
    corridor.add(frame)
    corridorFrames.push(frame)
    disposables.push(sideGeometry, right.geometry, topGeometry)
  }

  corridor.position.x = profile.motifs.corridor ? 0 : -7
  corridor.rotation.y = profile.motifs.corridor ? 0 : .35
  group.add(corridor)

  // Rotating Penrose-like stair helix.
  const stairGroup = new THREE.Group()
  const stairMaterial = impossibleMaterial(
    accent.clone().multiplyScalar(.5),
    .34 + profile.stability * .42,
  )
  disposables.push(stairMaterial)
  const stairs: THREE.Mesh[] = []
  const stairCount = settings.miniWorldDetail > 1 ? 30 : 18

  for (let index = 0; index < stairCount; index += 1) {
    const geometry = new THREE.BoxGeometry(1.05, .1, .42)
    const step = new THREE.Mesh(geometry, stairMaterial)
    const angle = index * .32
    const radius = 2.1 + Math.sin(index * .55) * .25
    step.position.set(
      Math.cos(angle) * radius,
      .25 + index * .19,
      Math.sin(angle) * radius,
    )
    step.rotation.y = -angle + Math.PI / 2
    stairGroup.add(step)
    stairs.push(step)
    disposables.push(geometry)
  }
  stairGroup.position.set(5.3, -.2, -10)
  group.add(stairGroup)

  // Floating floor slabs with no shared gravity plane.
  const floorGroup = new THREE.Group()
  const floorMaterial = impossibleMaterial(
    accent.clone().multiplyScalar(.26),
    .22 + profile.stability * .28,
  )
  disposables.push(floorMaterial)
  const floorTiles: THREE.Mesh[] = []
  for (let index = 0; index < 14; index += 1) {
    const geometry = new THREE.BoxGeometry(
      1.5 + seeded(seed + index, 2) * 2.5,
      .09,
      1.2 + seeded(seed + index, 3) * 2.1,
    )
    const tile = new THREE.Mesh(geometry, floorMaterial)
    tile.position.set(
      (seeded(seed + index, 4) - .5) * 18,
      .3 + seeded(seed + index, 5) * 5,
      -5 - seeded(seed + index, 6) * 22,
    )
    tile.rotation.set(
      (seeded(seed + index, 7) - .5) * .75,
      seeded(seed + index, 8) * Math.PI,
      (seeded(seed + index, 9) - .5) * .55,
    )
    floorGroup.add(tile)
    floorTiles.push(tile)
    disposables.push(geometry)
  }
  group.add(floorGroup)

  // Moving room walls. Lucidity straightens these as the field stabilizes.
  const room = new THREE.Group()
  const wallMaterial = impossibleMaterial(
    accent.clone().multiplyScalar(.3),
    .24 + profile.stability * .34,
  )
  disposables.push(wallMaterial)
  const walls: THREE.Mesh[] = []
  const wallTransforms: Array<{position: THREE.Vector3; rotationY: number}> = []
  ;[
    {p: [-4.5, 2.4, -12], s: [.14, 4.8, 8], ry: 0},
    {p: [4.5, 2.4, -12], s: [.14, 4.8, 8], ry: 0},
    {p: [0, 2.4, -16], s: [9, 4.8, .14], ry: 0},
  ].forEach(({p, s, ry}, index) => {
    const geometry = new THREE.BoxGeometry(s[0], s[1], s[2])
    const wall = new THREE.Mesh(geometry, wallMaterial)
    wall.position.set(p[0], p[1], p[2])
    wall.rotation.y = ry
    room.add(wall)
    walls.push(wall)
    wallTransforms.push({
      position: wall.position.clone(),
      rotationY: wall.rotation.y,
    })
    disposables.push(geometry)
  })
  group.add(room)

  // Destination portals: live render targets showing related dreams.
  relations.slice(0, depth < maxDepth ? 2 : 1).forEach((relation, index) => {
    const destination = relation.dream
    const recurrence = dreamRecurrence(destination, dreams)
    const destinationProfile = createDreamProfile(destination, recurrence)
    const category = categoryForDream(destination)
    const color = new THREE.Color(CATEGORY_COLORS[category])
    const cell = createDreamCell(
      destinationProfile,
      category,
      color,
      settings,
      seed + 500 + index * 113,
    )

    const frame = new THREE.Group()
    const frameMaterial = impossibleMaterial(
      color.clone().multiplyScalar(.48),
      .62,
    )
    const portalMaterial = (cell.portal.material as THREE.SpriteMaterial).clone()
    portalMaterial.opacity = .94
    portalMaterial.depthWrite = false

    const leftGeometry = new THREE.BoxGeometry(.12, 2.9, .12)
    const rightGeometry = leftGeometry.clone()
    const topGeometry = new THREE.BoxGeometry(2.15, .12, .12)
    const portalGeometry = new THREE.PlaneGeometry(1.85, 2.62)
    const left = new THREE.Mesh(leftGeometry, frameMaterial)
    const right = new THREE.Mesh(rightGeometry, frameMaterial)
    const top = new THREE.Mesh(topGeometry, frameMaterial)
    const portal = new THREE.Mesh(portalGeometry, portalMaterial)
    portal.userData.diveInteraction = {
      kind: 'portal',
      dreamId: destination._id,
      title: destination.title?.trim() || 'Untitled dream',
      depth: depth + 1,
    } satisfies Exclude<DiveInteraction, null>
    left.position.x = -1
    right.position.x = 1
    top.position.y = 1.39
    portal.position.z = -.04
    frame.add(left, right, top, portal)
    frame.position.set(
      index === 0 ? -4.5 : 4.6,
      1.45,
      -7.5 - index * 2.2,
    )
    frame.rotation.y = index === 0 ? .16 : -.18
    group.add(frame)
    pickables.push(portal)
    previews.push({
      cell,
      dream: destination,
      interaction: portal.userData.diveInteraction,
      object: frame,
    })
    disposables.push(
      frameMaterial,
      portalMaterial,
      leftGeometry,
      rightGeometry,
      topGeometry,
      portalGeometry,
    )
  })

  // Recursive memory cell: live miniature world nested inside this one.
  if (depth < maxDepth && relations.length > 0) {
    const relation = relations[Math.min(1, relations.length - 1)]
    const destination = relation.dream
    const recurrence = dreamRecurrence(destination, dreams)
    const destinationProfile = createDreamProfile(destination, recurrence)
    const category = categoryForDream(destination)
    const color = new THREE.Color(CATEGORY_COLORS[category])
    const cell = createDreamCell(
      destinationProfile,
      category,
      color,
      settings,
      seed + 1901,
    )
    cell.portal.position.set(3.1, 2.7, -5.1)
    cell.portal.scale.set(1.25, 1.25, 1)
    cell.portal.userData.diveInteraction = {
      kind: 'recursive-cell',
      dreamId: destination._id,
      title: destination.title?.trim() || 'Untitled dream',
      depth: depth + 1,
    } satisfies Exclude<DiveInteraction, null>
    group.add(cell.portal)
    pickables.push(cell.portal)
    previews.push({
      cell,
      dream: destination,
      interaction: cell.portal.userData.diveInteraction,
      object: cell.portal,
    })
  }

  // Deterministic dream mutation.
  let mutationObject: THREE.Object3D | null = null
  if (mutation === 'watcher') {
    const watcher = new THREE.Group()
    const whiteGeometry = new THREE.SphereGeometry(.52, 32, 32)
    const whiteMaterial = glowMaterial(new THREE.Color(0xdbe8ff), .24)
    const pupilGeometry = new THREE.SphereGeometry(.17, 20, 20)
    const pupilMaterial = new THREE.MeshBasicMaterial({color: 0x010105})
    const white = new THREE.Mesh(whiteGeometry, whiteMaterial)
    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
    pupil.position.z = .48
    watcher.add(white, pupil)
    watcher.position.set(0, 2.2, 5.5)
    watcher.rotation.y = Math.PI
    group.add(watcher)
    mutationObject = watcher
    disposables.push(whiteGeometry, whiteMaterial, pupilGeometry, pupilMaterial)
  } else if (mutation === 'wandering-door') {
    const door = new THREE.Group()
    const frameMaterial = impossibleMaterial(accent, .58)
    const glow = glowMaterial(accent, .16)
    const leftGeometry = new THREE.BoxGeometry(.08, 2.1, .08)
    const rightGeometry = leftGeometry.clone()
    const topGeometry = new THREE.BoxGeometry(1.55, .08, .08)
    const planeGeometry = new THREE.PlaneGeometry(1.3, 1.95)
    const left = new THREE.Mesh(leftGeometry, frameMaterial)
    const right = new THREE.Mesh(rightGeometry, frameMaterial)
    const top = new THREE.Mesh(topGeometry, frameMaterial)
    const plane = new THREE.Mesh(planeGeometry, glow)
    left.position.x = -.72
    right.position.x = .72
    top.position.y = 1
    door.add(left, right, top, plane)
    door.position.set(-2.7, 1.1, -5)
    group.add(door)
    mutationObject = door
    disposables.push(
      frameMaterial,
      glow,
      leftGeometry,
      rightGeometry,
      topGeometry,
      planeGeometry,
    )
  } else if (mutation === 'memory-fusion' && primaryRelation) {
    const fusion = new THREE.Group()
    const otherProfile = createDreamProfile(
      primaryRelation.dream,
      dreamRecurrence(primaryRelation.dream, dreams),
    )
    const color = new THREE.Color(profileAccent(otherProfile))
    for (let index = 0; index < 8; index += 1) {
      const geometry = new THREE.OctahedronGeometry(.15 + index * .025, 0)
      const material = glowMaterial(color, .08 + index * .015)
      const shard = new THREE.Mesh(geometry, material)
      shard.position.set(
        Math.cos(index * .9) * (1.2 + index * .11),
        1.2 + Math.sin(index * 1.2) * .8,
        -8 - index * .45,
      )
      fusion.add(shard)
      disposables.push(geometry, material)
    }
    group.add(fusion)
    mutationObject = fusion
  }

  let lastLookX = 0
  let lastLookY = 0

  return {
    group,
    renderPreviews: (renderer, time) => {
      previews.forEach(({cell}, index) => {
        cell.update(time, .35 + index * .08)
        cell.render(renderer)
      })
    },
    pick: (camera, ndcX, ndcY) => {
      pointer.set(ndcX, ndcY)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickables, true)[0]
      if (!hit) return null

      let object: THREE.Object3D | null = hit.object
      while (object && !object.userData.diveInteraction) {
        object = object.parent
      }
      return (object?.userData.diveInteraction as DiveInteraction) ?? null
    },
    update: (time, delta, temporalProgress, lookX, lookY) => {
      lastLookX = lookX
      lastLookY = lookY

      const historicalRepair = 1 - temporalProgress
      const lucidityField = profile.lucid
        ? .9
        : .22 + Math.max(0, 1 - Math.abs(lookX) - Math.abs(lookY)) * .26
      const instability = (1 - profile.stability) * (1 - lucidityField * .72)

      corridorFrames.forEach((frame, index) => {
        const cycle = 1.8 * corridorCount
        const drift = (time * (.38 + profile.wind * .18) + index * 1.8) % cycle
        frame.position.z = -5 - drift
        frame.rotation.z =
          Math.sin(time * .21 + index * .38) * instability * .07
        frame.visible =
          index % Math.max(1, Math.round(1 + profile.decay * temporalProgress * 2)) === 0 ||
          historicalRepair > .45
      })

      stairGroup.rotation.y =
        time * (.045 + (1 - profile.stability) * .055) * (1 - lucidityField * .7)
      stairGroup.rotation.z =
        Math.sin(time * .12) * instability * .12

      stairs.forEach((step, index) => {
        const missing =
          profile.decay * temporalProgress > .55 &&
          index % 5 === 0
        step.visible = !missing || historicalRepair > .35
      })

      floorTiles.forEach((tile, index) => {
        tile.position.y +=
          Math.sin(time * (.13 + index * .003) + index) *
          delta *
          (.08 + instability * .16)
        tile.rotation.x += delta * instability * .012
        tile.rotation.z -= delta * instability * .009
        tile.visible =
          historicalRepair > .5 ||
          index % Math.max(1, Math.round(1 + profile.decay * temporalProgress * 2)) !== 0
      })

      walls.forEach((wall, index) => {
        const original = wallTransforms[index]
        const sway = Math.sin(time * (.08 + index * .025) + index * 1.4)
        wall.position.x = THREE.MathUtils.lerp(
          original.position.x + sway * instability * 1.15,
          original.position.x,
          lucidityField,
        )
        wall.rotation.y = THREE.MathUtils.lerp(
          original.rotationY + sway * instability * .16,
          original.rotationY,
          lucidityField,
        )
        wall.visible =
          historicalRepair > .42 ||
          !(profile.decay * temporalProgress > .52 && index === 1)
      })

      previews.forEach(({object}, index) => {
        object.position.y +=
          Math.sin(time * .24 + index * 1.7) *
          delta *
          (.04 + instability * .04)
      })

      if (mutationObject) {
        if (mutation === 'watcher') {
          mutationObject.position.x =
            Math.sin(time * .035) * 2.8 - lookX * 1.3
          mutationObject.rotation.y = Math.PI + lookX * .3
        } else if (mutation === 'wandering-door') {
          const lookingAway = Math.abs(lookX) > .36
          const targetX = lookingAway ? 2.8 : -2.7
          mutationObject.position.x = THREE.MathUtils.lerp(
            mutationObject.position.x,
            targetX,
            .025,
          )
        } else {
          mutationObject.rotation.y += delta * .04
        }
      }
    },
    dispose: () => {
      previews.forEach(({cell}) => cell.dispose())
      disposables.forEach((item) => item.dispose())
    },
  }
}
