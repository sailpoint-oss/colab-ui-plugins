import { ShaderMaterial, Vector2, type Texture } from 'three';

/**
 * Blends a day texture and a night texture across the current subsolar point.
 * `sunPosition` and `globeRotation` are degrees of `[longitude, latitude]`.
 * Adapted from the globe.gl day-night example.
 */
const VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  #define PI 3.141592653589793
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec2 sunPosition;
  uniform vec2 globeRotation;
  uniform float nightScale;
  varying vec3 vNormal;
  varying vec2 vUv;

  float toRad(in float a) {
    return a * PI / 180.0;
  }

  vec3 polarToCartesian(in vec2 c) {
    float theta = toRad(90.0 - c.x);
    float phi = toRad(90.0 - c.y);
    return vec3(
      sin(phi) * cos(theta),
      cos(phi),
      sin(phi) * sin(theta)
    );
  }

  void main() {
    float invLon = toRad(globeRotation.x);
    float invLat = -toRad(globeRotation.y);
    mat3 rotX = mat3(
      1, 0, 0,
      0, cos(invLat), -sin(invLat),
      0, sin(invLat), cos(invLat)
    );
    mat3 rotY = mat3(
      cos(invLon), 0, sin(invLon),
      0, 1, 0,
      -sin(invLon), 0, cos(invLon)
    );
    vec3 rotatedSunDirection = rotX * rotY * polarToCartesian(sunPosition);
    float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
    vec4 dayColor = texture2D(dayTexture, vUv);
    vec4 nightColor = texture2D(nightTexture, vUv);
    float blendFactor = smoothstep(-0.1, 0.1, intensity);
    gl_FragColor = mix(nightColor * nightScale, dayColor, blendFactor);
    // The day texture is the same sRGB Blue Marble as the normal globe. Sampling
    // it returns linear color, so encode the output or the day side looks dark.
    #include <colorspace_fragment>
  }
`;

export interface DayNightMaterial {
  readonly material: ShaderMaterial;
  readonly sunPosition: Vector2;
  readonly globeRotation: Vector2;
}

export function createDayNightMaterial(
  dayTexture: Texture,
  nightTexture: Texture,
  nightScale = 1,
): DayNightMaterial {
  const sunPosition = new Vector2();
  const globeRotation = new Vector2();
  const material = new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunPosition: { value: sunPosition },
      globeRotation: { value: globeRotation },
      nightScale: { value: nightScale },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  return { material, sunPosition, globeRotation };
}
