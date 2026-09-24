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
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;

      void main() {
        vec4 viewPosition =
          modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;

      void main() {
        float facing = abs(dot(
          normalize(vViewNormal),
          normalize(vViewDirection)
        ));
        float fresnel = pow(
          1.0 - clamp(facing, 0.0, 1.0),
          2.35
        );
        float alpha = 0.028 + fresnel * 0.105;
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

  return {
    group,
    dispose: () => {
      parent.remove(group)
      domeGeometry.dispose()
      gridGeometry.dispose()
      constellationGeometry.dispose()
      domeMaterial.dispose()
      gridMaterial.dispose()
      constellationMaterial.dispose()
    },
  }
}
