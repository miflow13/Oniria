import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

// Assets were not present in this checkout. Set a path only after placing
// the corresponding licensed model under public/library/.
export const LIBRARY_ASSETS: Record<'bookshelf' | 'lawn' | 'sky', string | null> = {
  bookshelf: null,
  lawn: null,
  sky: null,
}

const cache = new Map<string, Promise<THREE.Group>>()
const loader = new GLTFLoader()

export function loadLibraryAsset(path: string, targetSize: number) {
  const key = `${path}:${targetSize}`
  if (!cache.has(key)) {
    cache.set(key, loader.loadAsync(path).then(({scene}) => {
      const bounds = new THREE.Box3().setFromObject(scene)
      const size = bounds.getSize(new THREE.Vector3())
      const max = Math.max(size.x, size.y, size.z)
      if (!Number.isFinite(max) || max <= 0) throw new Error(`Empty model: ${path}`)
      scene.scale.setScalar(targetSize / max)
      const normalized = new THREE.Box3().setFromObject(scene)
      const center = normalized.getCenter(new THREE.Vector3())
      scene.position.set(-center.x, -normalized.min.y, -center.z)
      return scene
    }))
  }
  return cache.get(key)!
}
