/**
 * Sun & Lens Flare Types (M13.9 & M13.10)
 * Reusable type definitions shared between Sun Lab and Forecast Dashboard.
 */

export type RendererType = "A" | "B" | "C";
export type LabMode = "scroll" | "manual";
export type LayerMode = "A" | "B" | "C" | "D";
export type SunModelType = "photographic" | "classic";

export type OpticalPhaseName =
  | "CALM"
  | "APPROACH"
  | "PRIMARY PEAK"
  | "RELEASE"
  | "SECOND APPROACH"
  | "SECONDARY PEAK"
  | "SETTLE";

export type ProductionChapterName =
  | "CALM"
  | "CHAPTER 1"
  | "RELEASE 1"
  | "CHAPTER 2"
  | "RELEASE 2"
  | "CHAPTER 3"
  | "SETTLE";

/**
 * Deterministic optical state returned by computeOpticalState(progress).
 */
export interface OpticalState {
  sunX: number;
  sunY: number;
  viewOffsetX: number;
  viewOffsetY: number;
  flareAxisAngle: number;
  intensity: number;
  bloom: number;
  haloStrength: number;
  haloScale: number;
  haloOffset: number;
  starburst: number;
  ghostStrength: number;
  ghostSpread: number;
  chromatic: number;
  haze: number;
  phaseName: OpticalPhaseName;
}

/**
 * Backward-compatible SunState interface for earlier consumers.
 */
export interface SunState extends OpticalState {
  halo: number; // alias to haloStrength
}

export interface PhotographicSunModelConfig {
  coreIntensity: number;
  coreRadius: number;
  bloomRadius: number;
  primaryRayStr: number;
  secondaryRayStr: number;
  warmScatter: number;
}

export interface SunShaderUniforms extends OpticalState, PhotographicSunModelConfig {
  sunModel: SunModelType;
  ghostCount: "low" | "medium" | "high";
  time: number;
  progress: number;
  layerPass: number;
}

export interface WebGLRendererState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  bgTex?: WebGLTexture;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
}
