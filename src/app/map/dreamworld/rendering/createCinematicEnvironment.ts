import * as THREE from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'

export type CinematicEnvironment = {
  texture: THREE.Texture
  dispose: () => void
}

export function createCinematicEnvironment(
  renderer: THREE.WebGLRenderer,
): CinematicEnvironment {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  const room = new RoomEnvironment()
  const target = pmrem.fromScene(room, 0.055)

  return {
    texture: target.texture,
    dispose: () => {
      target.dispose()
      pmrem.dispose()

      room.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose?.()
        const material = mesh.material
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose())
        } else {
          material?.dispose?.()
        }
      })
    },
  }
}
