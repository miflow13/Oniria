export type DreamQuality = 'low' | 'medium' | 'high' | 'cinematic'

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
}

export function getQualitySettings(quality: DreamQuality): DreamQualitySettings {
  switch (quality) {
    case 'low':
      return {
        pixelRatio: 1,
        bloomStrength: 0.58,
        bloomRadius: 0.42,
        bloomThreshold: 0.5,
        starCount: 420,
        debrisCount: 8,
        particleCount: 10,
        miniWorldDetail: 0,
        fogDensity: 0.04,
        cellResolution: 256,
        depthOfField: false,
        maxBlur: 0.0,
      }
    case 'medium':
      return {
        pixelRatio: 1.2,
        bloomStrength: 0.82,
        bloomRadius: 0.56,
        bloomThreshold: 0.42,
        starCount: 760,
        debrisCount: 14,
        particleCount: 18,
        miniWorldDetail: 1,
        fogDensity: 0.044,
        cellResolution: 384,
        depthOfField: true,
        maxBlur: 0.005,
      }
    case 'cinematic':
      return {
        pixelRatio: 1.85,
        bloomStrength: 1.46,
        bloomRadius: 0.84,
        bloomThreshold: 0.22,
        starCount: 1700,
        debrisCount: 38,
        particleCount: 44,
        miniWorldDetail: 2,
        fogDensity: 0.052,
        cellResolution: 768,
        depthOfField: true,
        maxBlur: 0.015,
      }
    case 'high':
    default:
      return {
        pixelRatio: 1.5,
        bloomStrength: 1.08,
        bloomRadius: 0.68,
        bloomThreshold: 0.32,
        starCount: 1180,
        debrisCount: 24,
        particleCount: 30,
        miniWorldDetail: 2,
        fogDensity: 0.047,
        cellResolution: 512,
        depthOfField: true,
        maxBlur: 0.009,
      }
  }
}
