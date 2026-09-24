export type DreamQuality = 'low' | 'medium' | 'high' | 'cinematic'

export type LibraryGraphicsOptions = {
  shadows: boolean
  bloom: boolean
  reducedMotion: boolean
  largeText: boolean
}

export const DEFAULT_LIBRARY_GRAPHICS_OPTIONS: LibraryGraphicsOptions = {
  shadows: false,
  bloom: true,
  reducedMotion: false,
  largeText: false,
}

export type DreamQualitySettings = {
  pixelRatio: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  starCount: number
  debrisCount: number
  particleCount: number
  miniWorldDetail: 0 | 1 | 2
  fogDensity: number
  cellResolution: 256 | 384 | 512 | 768
  depthOfField: boolean
  maxBlur: number
  ssao: boolean
  ssaoKernelRadius: number
  environmentIntensity: number
  atmosphereLayers: number
  portalBlendResolution: 0.6 | 0.75 | 1
}

export function getQualitySettings(quality: DreamQuality): DreamQualitySettings {
  switch (quality) {
    case 'low':
      return {
        pixelRatio: 1,
        bloomStrength: 0.42,
        bloomRadius: 0.42,
        bloomThreshold: 0.58,
        starCount: 420,
        debrisCount: 8,
        particleCount: 10,
        miniWorldDetail: 0,
        fogDensity: 0.04,
        cellResolution: 256,
        depthOfField: false,
        maxBlur: 0.0,
        ssao: false,
        ssaoKernelRadius: 0,
        environmentIntensity: 0.55,
        atmosphereLayers: 2,
        portalBlendResolution: 0.6,
      }
    case 'medium':
      return {
        pixelRatio: 1.2,
        bloomStrength: 0.58,
        bloomRadius: 0.56,
        bloomThreshold: 0.5,
        starCount: 760,
        debrisCount: 14,
        particleCount: 18,
        miniWorldDetail: 1,
        fogDensity: 0.044,
        cellResolution: 384,
        depthOfField: true,
        maxBlur: 0.005,
        ssao: true,
        ssaoKernelRadius: 7,
        environmentIntensity: 0.72,
        atmosphereLayers: 3,
        portalBlendResolution: 0.75,
      }
    case 'cinematic':
      return {
        pixelRatio: 1.85,
        bloomStrength: 0.92,
        bloomRadius: 0.76,
        bloomThreshold: 0.36,
        starCount: 1700,
        debrisCount: 38,
        particleCount: 44,
        miniWorldDetail: 2,
        fogDensity: 0.052,
        cellResolution: 768,
        depthOfField: true,
        maxBlur: 0.015,
        ssao: true,
        ssaoKernelRadius: 14,
        environmentIntensity: 1.05,
        atmosphereLayers: 6,
        portalBlendResolution: 1,
      }
    case 'high':
    default:
      return {
        pixelRatio: 1.5,
        bloomStrength: 0.72,
        bloomRadius: 0.62,
        bloomThreshold: 0.42,
        starCount: 1180,
        debrisCount: 24,
        particleCount: 30,
        miniWorldDetail: 2,
        fogDensity: 0.047,
        cellResolution: 512,
        depthOfField: true,
        maxBlur: 0.009,
        ssao: true,
        ssaoKernelRadius: 10,
        environmentIntensity: 0.88,
        atmosphereLayers: 4,
        portalBlendResolution: 1,
      }
  }
}
