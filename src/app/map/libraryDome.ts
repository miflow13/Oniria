import * as THREE from 'three'
import {floatingPhase, type FloatingPropRegistry} from './libraryFloating'
import {LIBRARY_BUILDING_BOUNDS} from './libraryRoomLayout'

export type LibraryDome = {
  group: THREE.Group
  dispose: () => void
}

const DOME_MARGIN = 6
const DOME_HEIGHT = 26
const DOME_BASE_Y = -.35
const CONSTELLATION_COUNT = 64
const LIBRARY_DELIGHT_EVENT = 'oniria:library-delight'
const LIBRARY_MOTION_EVENT =
  'oniria:library-motion-preference'

function createGridGeometry() {
  const vertices: number[] = []
  const pushSegment = (
    a: THREE.Vector3,
    b: THREE.Vector3,
  ) => {
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }

  const longitudeCount = 12
  const longitudeSteps = 20
  for (let longitude = 0; longitude < longitudeCount; longitude += 1) {
    const phi = (longitude / longitudeCount) * Math.PI * 2
    let previous: THREE.Vector3 | null = null
    for (let step = 0; step <= longitudeSteps; step += 1) {
      const theta = (step / longitudeSteps) * (Math.PI / 2)
      const sinTheta = Math.sin(theta)
      const point = new THREE.Vector3(
        Math.cos(phi) * sinTheta,
        Math.cos(theta),
        Math.sin(phi) * sinTheta,
      )
      if (previous) pushSegment(previous, point)
      previous = point
    }
  }

  const latitudeSteps = 48
  ;[.2, .36, .52, .68, .84].forEach((fraction) => {
    const theta = fraction * (Math.PI / 2)
    const sinTheta = Math.sin(theta)
    const y = Math.cos(theta)
    let previous: THREE.Vector3 | null = null
    for (let step = 0; step <= latitudeSteps; step += 1) {
      const phi = (step / latitudeSteps) * Math.PI * 2
      const point = new THREE.Vector3(
        Math.cos(phi) * sinTheta,
        y,
        Math.sin(phi) * sinTheta,
      )
      if (previous) pushSegment(previous, point)
      previous = point
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  return geometry
}

function createDevLogo() {
  const group = new THREE.Group()
  group.name = 'library-holographic-dome-dev-logo'
  group.userData.libraryDecorative = true
  group.userData.libraryNonInteractive = true

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  const width = 6.2
  const height = 2.7
  const radius = .34
  const depth = .38
  const shape = new THREE.Shape()

  shape.moveTo(-width / 2 + radius, -height / 2)
  shape.lineTo(width / 2 - radius, -height / 2)
  shape.quadraticCurveTo(
    width / 2,
    -height / 2,
    width / 2,
    -height / 2 + radius,
  )
  shape.lineTo(width / 2, height / 2 - radius)
  shape.quadraticCurveTo(
    width / 2,
    height / 2,
    width / 2 - radius,
    height / 2,
  )
  shape.lineTo(-width / 2 + radius, height / 2)
  shape.quadraticCurveTo(
    -width / 2,
    height / 2,
    -width / 2,
    height / 2 - radius,
  )
  shape.lineTo(-width / 2, -height / 2 + radius)
  shape.quadraticCurveTo(
    -width / 2,
    -height / 2,
    -width / 2 + radius,
    -height / 2,
  )

  const plaqueGeometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: .055,
    bevelThickness: .055,
    curveSegments: 10,
  })
  plaqueGeometry.translate(0, 0, -depth / 2)

  const plaqueMaterial = new THREE.MeshStandardMaterial({
    color: 0x111216,
    roughness: .28,
    metalness: .34,
    emissive: 0x07111a,
    emissiveIntensity: .28,
  })

  const letterMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f7fb,
    roughness: .38,
    metalness: .08,
    emissive: 0x8dd9ff,
    emissiveIntensity: .08,
  })

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x78d2ff,
    transparent: true,
    opacity: .44,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  edgeMaterial.toneMapped = false

  geometries.push(plaqueGeometry)
  materials.push(
    plaqueMaterial,
    letterMaterial,
    edgeMaterial,
  )

  const plaque = new THREE.Mesh(
    plaqueGeometry,
    plaqueMaterial,
  )
  plaque.castShadow = false
  plaque.receiveShadow = false
  plaque.userData.libraryDecorative = true
  plaque.userData.libraryNonInteractive = true
  group.add(plaque)

  const edgeGeometry = new THREE.EdgesGeometry(
    plaqueGeometry,
    24,
  )
  geometries.push(edgeGeometry)
  const edge = new THREE.LineSegments(
    edgeGeometry,
    edgeMaterial,
  )
  edge.name = 'library-dev-logo-holographic-edge'
  edge.renderOrder = 3
  edge.userData.libraryDecorative = true
  edge.userData.libraryNonInteractive = true
  group.add(edge)

  const letterDepth = .24
  const letterZ = depth / 2 + letterDepth / 2 + .035

  const addBar = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    barWidth: number,
    barHeight: number,
    rotationZ = 0,
  ) => {
    const geometry = new THREE.BoxGeometry(
      barWidth,
      barHeight,
      letterDepth,
    )
    geometries.push(geometry)
    const bar = new THREE.Mesh(
      geometry,
      letterMaterial,
    )
    bar.position.set(x, y, letterZ)
    bar.rotation.z = rotationZ
    bar.castShadow = false
    bar.receiveShadow = false
    bar.userData.libraryDecorative = true
    bar.userData.libraryNonInteractive = true
    parent.add(bar)
  }

  const letterHeight = 1.42
  const stroke = .22

  const d = new THREE.Group()
  d.position.x = -1.72
  addBar(d, -.43, 0, stroke, letterHeight)
  addBar(d, 0, .6, .86, stroke)
  addBar(d, 0, -.6, .86, stroke)
  addBar(d, .43, 0, stroke, 1.03)
  group.add(d)

  const e = new THREE.Group()
  e.position.x = 0
  addBar(e, -.43, 0, stroke, letterHeight)
  addBar(e, 0, .6, .86, stroke)
  addBar(e, -.03, 0, .74, stroke)
  addBar(e, 0, -.6, .86, stroke)
  group.add(e)

  const v = new THREE.Group()
  v.position.x = 1.72
  addBar(v, -.27, .02, stroke, 1.38, .37)
  addBar(v, .27, .02, stroke, 1.38, -.37)
  group.add(v)

  return {
    group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
    },
  }
}

function createConstellationGeometry() {
  let seed = 0x4f4e4952
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  const positions: number[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (let index = 0; index < CONSTELLATION_COUNT; index += 1) {
    const radial =
      .14 +
      Math.sqrt(random()) * .68
    const angle =
      index * goldenAngle +
      (random() - .5) * .26
    const y = Math.sqrt(
      Math.max(0, 1 - radial * radial),
    )

    positions.push(
      Math.cos(angle) * radial,
      y,
      Math.sin(angle) * radial,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  return geometry
}


function createInfiniteHorizonSilhouettes(
  centerX: number,
  centerZ: number,
  domeRadius: number,
) {
  const group = new THREE.Group()
  group.name = 'library-infinite-horizon'
  group.userData.libraryDecorative = true
  group.userData.libraryNonInteractive = true

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  const shelfGeometry = new THREE.BoxGeometry(1, 1, 1)
  const railGeometry = new THREE.BoxGeometry(1, 1, 1)
  geometries.push(shelfGeometry, railGeometry)

  const shelfMaterial = new THREE.MeshBasicMaterial({
    color: 0x173349,
    transparent: true,
    opacity: .14,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  })
  const shelfGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5bc8ff,
    transparent: true,
    opacity: .055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false,
  })
  const railMaterial = new THREE.MeshBasicMaterial({
    color: 0x8ccfff,
    transparent: true,
    opacity: .07,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  })
  materials.push(
    shelfMaterial,
    shelfGlowMaterial,
    railMaterial,
  )

  const directions = [
    {x: 0, z: -1, yaw: 0},
    {x: 1, z: -.36, yaw: Math.PI / 2},
    {x: -1, z: -.36, yaw: Math.PI / 2},
  ] as const

  directions.forEach((direction, directionIndex) => {
    for (let depthIndex = 0; depthIndex < 6; depthIndex += 1) {
      const distance =
        domeRadius * (.67 + depthIndex * .075)
      const baseX = centerX + direction.x * distance
      const baseZ = centerZ + direction.z * distance
      const spread = 8 + depthIndex * 2.8

      for (let rowIndex = -4; rowIndex <= 4; rowIndex += 1) {
        const verticalTier =
          (Math.abs(rowIndex + directionIndex) + depthIndex) % 3
        const height = 3.8 + verticalTier * 1.55
        const width = 2.8 + ((rowIndex + 5) % 3) * .65
        const depth = .5
        const offset = rowIndex * spread

        const shelf = new THREE.Mesh(
          shelfGeometry,
          shelfMaterial,
        )
        shelf.position.set(
          baseX +
            (direction.x === 0 ? offset : direction.x * depthIndex),
          1.6 + verticalTier * 1.25,
          baseZ +
            (direction.x !== 0 ? offset : direction.z * depthIndex),
        )
        shelf.scale.set(width, height, depth)
        shelf.rotation.y = direction.yaw
        shelf.userData.libraryDecorative = true
        shelf.userData.libraryNonInteractive = true
        group.add(shelf)

        const glow = new THREE.Mesh(
          shelfGeometry,
          shelfGlowMaterial,
        )
        glow.position.copy(shelf.position)
        glow.position.y += .18
        glow.scale.set(width * .82, .08, depth * 1.08)
        glow.rotation.y = direction.yaw
        glow.userData.libraryDecorative = true
        glow.userData.libraryNonInteractive = true
        group.add(glow)
      }
    }
  })

  ;[
    {y: 7.2, radius: domeRadius * .72, opacity: .08},
    {y: 10.4, radius: domeRadius * .81, opacity: .055},
  ].forEach(({y, radius, opacity}, ringIndex) => {
    const ringMaterial = railMaterial.clone()
    ringMaterial.opacity = opacity
    materials.push(ringMaterial)

    const segmentCount = 48
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2
      const segment = new THREE.Mesh(
        railGeometry,
        ringMaterial,
      )
      segment.position.set(
        centerX + Math.cos(angle) * radius,
        y,
        centerZ + Math.sin(angle) * radius,
      )
      segment.scale.set(2.1, .06, .08)
      segment.rotation.y = -angle
      segment.userData.libraryDecorative = true
      segment.userData.libraryNonInteractive = true
      group.add(segment)
    }

    group.userData[`horizonRing${ringIndex}`] = true
  })

  return {
    group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
    },
  }
}

export function createLibraryDome(
  parent: THREE.Object3D,
  floatingProps: FloatingPropRegistry,
): LibraryDome {
  const group = new THREE.Group()
  group.name = 'library-holographic-dome'
  group.userData.libraryDecorative = true
  group.userData.libraryNonInteractive = true
  parent.add(group)

  const width =
    LIBRARY_BUILDING_BOUNDS.maxX -
    LIBRARY_BUILDING_BOUNDS.minX
  const depth =
    LIBRARY_BUILDING_BOUNDS.maxZ -
    LIBRARY_BUILDING_BOUNDS.minZ
  const centerX =
    (LIBRARY_BUILDING_BOUNDS.minX +
      LIBRARY_BUILDING_BOUNDS.maxX) /
    2
  const centerZ =
    (LIBRARY_BUILDING_BOUNDS.minZ +
      LIBRARY_BUILDING_BOUNDS.maxZ) /
    2
  const footprintRadius = Math.hypot(
    width / 2,
    depth / 2,
  )
  const domeRadius = footprintRadius + DOME_MARGIN

  const domeGeometry = new THREE.SphereGeometry(
    1,
    56,
    20,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  )
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: {
        value: new THREE.Color(0x63c7ff),
      },
      uTime: {value: 0},
      uPulseStart: {value: -100},
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;

      void main() {
        vec4 viewPosition =
          modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        vLocalPosition = position;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uPulseStart;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;

      void main() {
        float facing = abs(dot(
          normalize(vViewNormal),
          normalize(vViewDirection)
        ));
        float fresnel = pow(
          1.0 - clamp(facing, 0.0, 1.0),
          2.35
        );

        float shimmer =
          pow(
            max(
              0.0,
              sin(uTime * 0.24 + vLocalPosition.y * 7.0)
            ),
            12.0
          ) * 0.008;

        float pulseAge = uTime - uPulseStart;
        float pulseEnabled = step(0.0, pulseAge) *
          (1.0 - step(2.5, pulseAge));
        float pulseRadius = clamp(pulseAge / 2.2, 0.0, 1.2);
        float radial = length(vLocalPosition.xz);
        float pulseRing =
          exp(-pow((radial - pulseRadius) * 10.0, 2.0)) *
          pulseEnabled *
          (1.0 - smoothstep(0.0, 2.5, pulseAge));

        float alpha =
          0.028 +
          fresnel * 0.105 +
          shimmer +
          pulseRing * 0.045;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  })
  domeMaterial.toneMapped = false

  const dome = new THREE.Mesh(
    domeGeometry,
    domeMaterial,
  )
  dome.name = 'library-holographic-dome-surface'
  dome.position.set(centerX, DOME_BASE_Y, centerZ)
  dome.scale.set(
    domeRadius,
    DOME_HEIGHT,
    domeRadius,
  )
  dome.castShadow = false
  dome.receiveShadow = false
  dome.userData.libraryDecorative = true
  dome.userData.libraryNonInteractive = true

  let reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches === true

  const handleMotionPreference = (event: Event) => {
    reducedMotion = Boolean(
      (
        event as CustomEvent<{reducedMotion?: boolean}>
      ).detail?.reducedMotion,
    )
  }
  const handleDelight = () => {
    if (reducedMotion) return
    domeMaterial.uniforms.uPulseStart.value =
      performance.now() / 1000
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(
      LIBRARY_MOTION_EVENT,
      handleMotionPreference as EventListener,
    )
    window.addEventListener(
      LIBRARY_DELIGHT_EVENT,
      handleDelight,
    )
  }

  dome.onBeforeRender = () => {
    domeMaterial.uniforms.uTime.value = reducedMotion
      ? 0
      : performance.now() / 1000
  }

  group.add(dome)

  const gridGeometry = createGridGeometry()
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x78d2ff,
    transparent: true,
    opacity: .072,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  gridMaterial.toneMapped = false

  const grid = new THREE.LineSegments(
    gridGeometry,
    gridMaterial,
  )
  grid.name = 'library-holographic-dome-grid'
  grid.position.copy(dome.position)
  grid.scale.copy(dome.scale)
  grid.userData.libraryDecorative = true
  grid.userData.libraryNonInteractive = true
  group.add(grid)

  const constellationGeometry =
    createConstellationGeometry()
  const constellationMaterial =
    new THREE.PointsMaterial({
      color: 0xb6e8ff,
      size: .13,
      sizeAttenuation: true,
      transparent: true,
      opacity: .58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  constellationMaterial.toneMapped = false

  const constellationField = new THREE.Points(
    constellationGeometry,
    constellationMaterial,
  )
  constellationField.name =
    'library-holographic-dome-constellations'
  constellationField.scale.set(
    domeRadius * .96,
    DOME_HEIGHT * .96,
    domeRadius * .96,
  )
  constellationField.userData.libraryDecorative = true
  constellationField.userData.libraryNonInteractive = true

  const constellationDrift = new THREE.Group()
  constellationDrift.name =
    'library-holographic-dome-constellation-drift'
  constellationDrift.position.set(
    centerX,
    DOME_BASE_Y,
    centerZ,
  )
  constellationDrift.userData.libraryDecorative = true
  constellationDrift.userData.libraryNonInteractive = true
  constellationDrift.add(constellationField)
  group.add(constellationDrift)

  constellationDrift.onBeforeRender = () => {
    if (reducedMotion) {
      constellationDrift.rotation.y = 0
      return
    }
    constellationDrift.rotation.y =
      performance.now() / 1000 * .006
  }

  floatingProps.register(constellationDrift, {
    phase: floatingPhase(constellationDrift.name),
    hoverAmplitude: .12,
    hoverSpeed: .22,
    secondaryHoverAmplitude: .035,
    secondaryHoverSpeed: .31,
    tiltY: .012,
    driftSide: .62,
    driftForward: .38,
    driftSpeedSide: .11,
    driftSpeedForward: .085,
  })

  // This is intentionally an ambient approximation rather than physically
  // transmitted dome light: one cheap sky/ground contribution keeps the
  // existing warm fixtures dominant while allowing upper-facing materials
  // to pick up a faint cyan cast.
  const infiniteHorizon = createInfiniteHorizonSilhouettes(
    centerX,
    centerZ,
    domeRadius,
  )
  group.add(infiniteHorizon.group)

  const domeLight = new THREE.HemisphereLight(
    0x78c9ff,
    0x241c23,
    .18,
  )
  domeLight.name = 'library-holographic-dome-light'
  domeLight.position.set(
    centerX,
    DOME_HEIGHT,
    centerZ,
  )
  group.add(domeLight)

  const devLogo = createDevLogo()
  devLogo.group.position.set(
    centerX,
    DOME_BASE_Y + DOME_HEIGHT - 3.2,
    centerZ + 1.8,
  )
  // Face the entrance/main hall (+Z) so the mark reads naturally from spawn
  // and remains a crown element rather than a floor-facing ceiling decal.
  devLogo.group.rotation.x = -.08
  devLogo.group.scale.setScalar(.92)
  group.add(devLogo.group)

  return {
    group,
    dispose: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(
          LIBRARY_MOTION_EVENT,
          handleMotionPreference as EventListener,
        )
        window.removeEventListener(
          LIBRARY_DELIGHT_EVENT,
          handleDelight,
        )
      }
      dome.onBeforeRender = () => {}
      constellationDrift.onBeforeRender = () => {}
      parent.remove(group)
      domeGeometry.dispose()
      gridGeometry.dispose()
      constellationGeometry.dispose()
      domeMaterial.dispose()
      gridMaterial.dispose()
      constellationMaterial.dispose()
      devLogo.dispose()
      infiniteHorizon.dispose()
    },
  }
}
