import * as THREE from 'three'
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

export const LIBRARY_ASSETS = {
  wallPanel: '/assets/library-kit/library-wall-panel.glb',
  wallCorner: '/assets/library-kit/library-wall-corner.glb',
  floorParquet: '/assets/library-kit/library-floor-parquet.glb',
  roofTile: '/assets/library-kit/bath-floor-tile.glb',
  skyDome: '/assets/library-kit/day-sky-dome.glb',
  stackShelf: '/assets/library-kit/stack-shelf.glb',
  decoyBookshelf: '/assets/library-kit/decoy-bookshelf.glb',
  areaRug: '/assets/library-kit/area-rug.glb',
  armchair: '/assets/library-kit/armchair.glb',
  issueDesk: '/assets/library-kit/issue-desk.glb',
  cardCatalogue: '/assets/library-kit/card-catalogue.glb',
  displayCase: '/assets/library-kit/display-case.glb',
  periodicalRack: '/assets/library-kit/periodical-rack.glb',
  pendantLight: '/assets/library-kit/library-pendant-light.glb',
  archedWindow: '/assets/library-kit/arched-window.glb',
} as const

export type LibraryAssetKey = keyof typeof LIBRARY_ASSETS
export type LibraryAssetFitMode = 'height' | 'span'

const cache = new Map<string, Promise<THREE.Group>>()
const loader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
dracoLoader.setDecoderConfig({type: 'js'})
loader.setDRACOLoader(dracoLoader)

function prepareAsset(
  root: THREE.Group,
  targetSize: number,
  mode: LibraryAssetFitMode,
) {
  root.updateMatrixWorld(true)
  let bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const denominator =
    mode === 'height'
      ? size.y
      : Math.max(size.x, size.z)

  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error('Library asset has no measurable bounds.')
  }

  root.scale.multiplyScalar(targetSize / denominator)
  root.updateMatrixWorld(true)
  bounds = new THREE.Box3().setFromObject(root)
  const center = bounds.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.y -= bounds.min.y
  root.position.z -= center.z
  root.updateMatrixWorld(true)

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = true
  })

  return root
}

export function loadLibraryAsset(
  key: LibraryAssetKey,
  targetSize: number,
  mode: LibraryAssetFitMode = 'height',
) {
  const path = LIBRARY_ASSETS[key]
  const cacheKey = `${path}:${targetSize}:${mode}`
  if (!cache.has(cacheKey)) {
    cache.set(
      cacheKey,
      loader
        .loadAsync(path)
        .then(({scene}) =>
          prepareAsset(scene, targetSize, mode),
        ),
    )
  }
  return cache.get(cacheKey)!
}
