import * as THREE from 'three'
import {loadLibraryAsset} from './libraryAssets'
import {LIBRARY_ROOMS} from './libraryRoomLayout'

type WallRun = {
  x: number
  z: number
  length: number
  axis: 'x' | 'z'
  rotationY: number
  windows: boolean
}

export type LibraryBuilding = {
  group: THREE.Group
  ready: Promise<void>
  dispose: () => void
}

export function createLibraryBuilding(
  scene: THREE.Scene,
): LibraryBuilding {
  const group = new THREE.Group()
  group.name = 'sanity-room-library-building'
  scene.add(group)

  let disposed = false
  const localMaterials: THREE.Material[] = []
  const localGeometries: THREE.BufferGeometry[] = []

  const backupFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0xb88958,
    roughness: .72,
    metalness: .02,
  })
  const backupWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xece9e3,
    roughness: .78,
    metalness: .02,
  })
  const backupCeilingMaterial = new THREE.MeshBasicMaterial({
    color: 0xf6f6f3,
    side: THREE.DoubleSide,
  })
  localMaterials.push(
    backupFloorMaterial,
    backupWallMaterial,
    backupCeilingMaterial,
  )

  const floorGeometry = new THREE.BoxGeometry(48.9, .08, 89.6)
  localGeometries.push(floorGeometry)
  const backupFloor = new THREE.Mesh(
    floorGeometry,
    backupFloorMaterial,
  )
  backupFloor.position.set(0, -.04, -30.15)
  backupFloor.receiveShadow = true
  group.add(backupFloor)

  const ceilingGeometry = new THREE.PlaneGeometry(48.9, 89.6)
  localGeometries.push(ceilingGeometry)
  const backupCeiling = new THREE.Mesh(
    ceilingGeometry,
    backupCeilingMaterial,
  )
  backupCeiling.rotation.x = Math.PI / 2
  backupCeiling.position.set(0, 5.03, -30.15)
  group.add(backupCeiling)

  const wallRuns: WallRun[] = [
    {
      x: -24.4,
      z: -30,
      length: 90,
      axis: 'z',
      rotationY: Math.PI / 2,
      windows: true,
    },
    {
      x: 24.4,
      z: -30,
      length: 90,
      axis: 'z',
      rotationY: -Math.PI / 2,
      windows: true,
    },
    {
      x: 0,
      z: 14.7,
      length: 49,
      axis: 'x',
      rotationY: Math.PI,
      windows: true,
    },
    {
      x: 0,
      z: -75,
      length: 49,
      axis: 'x',
      rotationY: 0,
      windows: true,
    },
  ]

  const backupWalls = new THREE.Group()
  backupWalls.name = 'library-backup-walls'
  group.add(backupWalls)

  const addWall = (
    x: number,
    z: number,
    width: number,
    depth: number,
    height = 5,
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    localGeometries.push(geometry)
    const wall = new THREE.Mesh(geometry, backupWallMaterial)
    wall.position.set(x, height / 2, z)
    wall.receiveShadow = true
    backupWalls.add(wall)
  }

  addWall(-24.4, -30, .3, 90, 5)
  addWall(24.4, -30, .3, 90, 5)
  addWall(0, -75, 49, .3, 5)
  addWall(0, 14.7, 49, .3, 5)

  for (const z of [-22, -42, -62]) {
    addWall(-16.2, z, 16, .28, 5)
    addWall(16.2, z, 16, .28, 5)
    wallRuns.push(
      {
        x: -16.2,
        z,
        length: 16,
        axis: 'x',
        rotationY: 0,
        windows: false,
      },
      {
        x: 16.2,
        z,
        length: 16,
        axis: 'x',
        rotationY: 0,
        windows: false,
      },
    )
  }

  for (const room of LIBRARY_ROOMS) {
    const [x, z] = room.center
    const left = x < 0
    const edgeX = left ? -8 : 8
    const rotationY = left ? Math.PI / 2 : -Math.PI / 2

    for (const dz of [-6, 6]) {
      addWall(edgeX, z + dz, .28, 8.6, 5)
      wallRuns.push({
        x: edgeX,
        z: z + dz,
        length: 8.6,
        axis: 'z',
        rotationY,
        windows: false,
      })
    }

    const light = new THREE.PointLight(room.accent, 2.4, 13, 2)
    light.position.set(x, 3.35, z)
    group.add(light)
  }

  addWall(-8, 9, .28, 11, 5)
  addWall(8, 9, .28, 11, 5)
  wallRuns.push(
    {
      x: -8,
      z: 9,
      length: 11,
      axis: 'z',
      rotationY: Math.PI / 2,
      windows: false,
    },
    {
      x: 8,
      z: 9,
      length: 11,
      axis: 'z',
      rotationY: -Math.PI / 2,
      windows: false,
    },
  )

  const placeAsset = (
    template: THREE.Group,
    x: number,
    y: number,
    z: number,
    scale = 1,
    rotationY = 0,
    rotationX = 0,
  ) => {
    const instance = template.clone(true)
    instance.position.x += x
    instance.position.y += y
    instance.position.z += z
    instance.scale.multiplyScalar(scale)
    instance.rotation.y += rotationY
    instance.rotation.x += rotationX
    instance.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.frustumCulled = true
      child.receiveShadow = true
    })
    group.add(instance)
    return instance
  }

  const ready = (async () => {
    const requests = await Promise.allSettled([
      loadLibraryAsset('wallPanel', 5, 'height'),
      loadLibraryAsset('wallCorner', 5, 'height'),
      loadLibraryAsset('floorParquet', 5.8, 'span'),
      loadLibraryAsset('roofTile', 5.2, 'span'),
      loadLibraryAsset('skyDome', 190, 'span'),
      loadLibraryAsset('decoyBookshelf', 3.15, 'height'),
      loadLibraryAsset('areaRug', 4.2, 'span'),
      loadLibraryAsset('armchair', .9, 'height'),
      loadLibraryAsset('issueDesk', 1.45, 'height'),
      loadLibraryAsset('cardCatalogue', 1.85, 'height'),
      loadLibraryAsset('displayCase', 1.45, 'height'),
      loadLibraryAsset('periodicalRack', 1.75, 'height'),
      loadLibraryAsset('pendantLight', 1.05, 'height'),
      loadLibraryAsset('archedWindow', 5, 'height'),
    ])

    if (disposed) return

    const value = (index: number): THREE.Group | null => {
      const request = requests[index]
      return request?.status === 'fulfilled'
        ? request.value
        : null
    }

    const wallPanel = value(0)
    const wallCorner = value(1)
    const floorParquet = value(2)
    const roofTile = value(3)
    const skyDome = value(4)
    const decoyBookshelf = value(5)
    const areaRug = value(6)
    const armchair = value(7)
    const issueDesk = value(8)
    const cardCatalogue = value(9)
    const displayCase = value(10)
    const periodicalRack = value(11)
    const pendantLight = value(12)
    const archedWindow = value(13)

    if (skyDome) {
      const dome = placeAsset(skyDome, 0, -8, -30)
      dome.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        })
        localMaterials.push(material)
        child.material = material
        child.castShadow = false
        child.receiveShadow = false
        child.renderOrder = -100
      })
    }

    if (wallPanel) {
      const templateWidth = (template: THREE.Group) =>
        Math.max(
          .1,
          new THREE.Box3()
            .setFromObject(template)
            .getSize(new THREE.Vector3()).x,
        )

      wallRuns.forEach((run) => {
        const wallSpan = templateWidth(wallPanel)
        const count = Math.max(
          1,
          Math.ceil(run.length / Math.max(.65, wallSpan * .97)),
        )
        const cell = run.length / count

        for (let index = 0; index < count; index += 1) {
          const along =
            (run.axis === 'x' ? run.x : run.z) -
            run.length / 2 +
            cell * (index + .5)
          const useWindow =
            Boolean(run.windows && archedWindow) &&
            index > 1 &&
            index < count - 2 &&
            index % 4 === 2
          const template =
            useWindow && archedWindow ? archedWindow : wallPanel
          const instance = placeAsset(
            template,
            run.axis === 'x' ? along : run.x,
            .04,
            run.axis === 'z' ? along : run.z,
            1,
            run.rotationY,
          )
          const width = templateWidth(template)
          instance.scale.x *= (cell / width) * 1.018
        }
      })

      backupWalls.visible = false
    }

    if (wallCorner) {
      ;[
        {x: -24.4, z: 14.7, r: Math.PI / 2},
        {x: 24.4, z: 14.7, r: Math.PI},
        {x: 24.4, z: -75, r: -Math.PI / 2},
        {x: -24.4, z: -75, r: 0},
      ].forEach(({x, z, r}) =>
        placeAsset(wallCorner, x, .04, z, 1, r),
      )
    }

    if (floorParquet) {
      const size = new THREE.Box3()
        .setFromObject(floorParquet)
        .getSize(new THREE.Vector3())
      const tileX = Math.max(2.4, size.x)
      const tileZ = Math.max(2.4, size.z)
      const countX = Math.ceil(48.9 / tileX)
      const countZ = Math.ceil(89.6 / tileZ)
      const cellX = 48.9 / countX
      const cellZ = 89.6 / countZ

      for (let ix = 0; ix < countX; ix += 1) {
        for (let iz = 0; iz < countZ; iz += 1) {
          const x = -24.45 + cellX * (ix + .5)
          const z = -74.95 + cellZ * (iz + .5)
          const tile = placeAsset(floorParquet, x, .008, z)
          tile.scale.x *= (cellX / size.x) * .995
          tile.scale.z *= (cellZ / size.z) * .995
        }
      }

      backupFloor.visible = false
    }

    if (roofTile) {
      const ceilingMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      localMaterials.push(ceilingMaterial)

      const size = new THREE.Box3()
        .setFromObject(roofTile)
        .getSize(new THREE.Vector3())
      const tileX = Math.max(1.2, size.x)
      const tileZ = Math.max(1.2, size.z)
      const countX = Math.ceil(48.9 / tileX)
      const countZ = Math.ceil(89.6 / tileZ)
      const cellX = 48.9 / countX
      const cellZ = 89.6 / countZ

      for (let ix = 0; ix < countX; ix += 1) {
        for (let iz = 0; iz < countZ; iz += 1) {
          const x = -24.45 + cellX * (ix + .5)
          const z = -74.95 + cellZ * (iz + .5)
          const tile = placeAsset(
            roofTile,
            x,
            5.03,
            z,
            1,
            0,
            Math.PI,
          )
          tile.scale.x *= (cellX / size.x) * 1.015
          tile.scale.z *= (cellZ / size.z) * 1.015
          tile.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return
            child.material = ceilingMaterial
            child.castShadow = false
            child.receiveShadow = false
          })
        }
      }

      backupCeiling.visible = false
    }

    if (decoyBookshelf) {
      const size = new THREE.Box3()
        .setFromObject(decoyBookshelf)
        .getSize(new THREE.Vector3())
      const axisCorrection =
        size.x >= size.z ? 0 : Math.PI / 2

      const placeDecoy = (
        x: number,
        z: number,
        rotationY: number,
        index: number,
      ) => {
        const shelf = placeAsset(
          decoyBookshelf,
          x,
          .02,
          z,
          1,
          rotationY + axisCorrection,
        )
        shelf.scale.x *= 1 + ((index % 3) - 1) * .018
        shelf.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.castShadow = false
        })
      }

      const zRows = [-21.55, -22.45, -41.55, -42.45, -61.55]
      zRows.forEach((z, rowIndex) => {
        const rotationY = rowIndex % 2 === 0 ? 0 : Math.PI
        const xs = [
          -22.5, -20.7, -18.9, -17.1, -15.3, -13.5, -11.7,
          11.7, 13.5, 15.3, 17.1, 18.9, 20.7, 22.5,
        ]
        xs.forEach((x, index) =>
          placeDecoy(x, z, rotationY, index),
        )
      })

      const wallZs = [-5, -10, -29, -34, -49, -54, -68]
      wallZs.forEach((z, index) => {
        placeDecoy(-23.35, z, Math.PI / 2, index)
        placeDecoy(23.35, z, -Math.PI / 2, index)
      })
    }

    if (areaRug) {
      ;[
        {x: -20.8, z: -5.2, r: 0},
        {x: 20.8, z: -5.2, r: Math.PI},
        {x: -20.8, z: -25.3, r: 0},
        {x: 20.8, z: -45.3, r: Math.PI},
      ].forEach(({x, z, r}) =>
        placeAsset(areaRug, x, .022, z, 1, r),
      )
    }

    if (armchair) {
      ;[
        {x: -22.05, z: -5.2, r: Math.PI / 2},
        {x: 22.05, z: -5.2, r: -Math.PI / 2},
        {x: -22.05, z: -25.3, r: Math.PI / 2},
        {x: 22.05, z: -45.3, r: -Math.PI / 2},
      ].forEach(({x, z, r}) =>
        placeAsset(armchair, x, .025, z, 1, r),
      )
    }

    if (pendantLight) {
      LIBRARY_ROOMS.forEach((room) => {
        const [x, z] = room.center
        placeAsset(pendantLight, x, 4.05, z)
      })
      for (const z of [6, -8, -28, -48, -68]) {
        placeAsset(pendantLight, 0, 4.2, z, .92)
      }
    }

    if (issueDesk) {
      placeAsset(issueDesk, -3.8, .03, 8, 1, Math.PI / 2)
      placeAsset(issueDesk, -16, .03, -52, .9)
    }
    if (displayCase) {
      placeAsset(displayCase, -16, .03, -12, 1, Math.PI / 2)
    }
    if (periodicalRack) {
      placeAsset(periodicalRack, 16, .03, -12, 1, -Math.PI / 2)
    }
    if (cardCatalogue) {
      placeAsset(cardCatalogue, -16, .03, -32, .95, Math.PI / 2)
      placeAsset(cardCatalogue, -12.5, .03, -52, .86, Math.PI / 2)
    }
  })().catch((error) => {
    console.warn('Library building asset pass failed', error)
  })

  return {
    group,
    ready,
    dispose: () => {
      disposed = true
      scene.remove(group)
      localGeometries.forEach((geometry) => geometry.dispose())
      localMaterials.forEach((material) => material.dispose())
    },
  }
}
