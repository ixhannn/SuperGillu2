import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { AmbientService } from '../services/ambient';

// An advanced, high-performance WebGL fluid aurora shader 
const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uAudioReact;
varying vec2 vUv;

// Classic Perlin 3D Noise 
// by Stefan Gustavson
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    // React to mouse pointer creating a ripple displacement
    float mouseDist = length(p - uMouse);
    float mousePull = exp(-mouseDist * 2.0) * 0.5;
    
    // Time factor + Audio Reactivity!
    float t = uTime * 0.15 + uAudioReact * 0.1;

    // Create complex flowing noise layers
    float n1 = snoise(vec3(p * 0.5 - mousePull, t));
    float n2 = snoise(vec3(p * 1.5 + n1 * 0.5, t * 1.2));
    float n3 = snoise(vec3(p * 3.0 + n2, t * 0.8));

    // Combine into an aurora fluid field
    float aurora = (n1 + n2 * 0.5 + n3 * 0.25) * 0.5 + 0.5;
    
    // Map to beautiful warm colors (Rose -> Coral -> Amber)
    vec3 color1 = vec3(1.0, 0.4, 0.5); // Rose
    vec3 color2 = vec3(0.9, 0.6, 0.3); // Amber
    vec3 color3 = vec3(0.5, 0.2, 0.4); // Deep Purple Backing
    
    vec3 finalColor = mix(color3, color1, smoothstep(0.0, 0.6, aurora));
    finalColor = mix(finalColor, color2, smoothstep(0.4, 1.0, aurora));

    // Desaturate and fade out edges slightly for atmospheric look
    float vignette = length(vUv - 0.5) * 2.0;
    finalColor = mix(finalColor, color3, vignette * 0.5);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const LiveBackground: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const audioReactRef = useRef(0); // Can be driven by AudioService later

    useEffect(() => {
        if (!containerRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        // Use a lower resolution multiplier for extreme performance while maintaining blur
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        const updateSize = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            renderer.setSize(w, h);
            uniforms.uResolution.value.set(w, h);
        };

        containerRef.current.appendChild(renderer.domElement);

        // Uniforms for the shader
        const uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2() },
            uMouse: { value: new THREE.Vector2(-10, -10) },
            uAudioReact: { value: 0 }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            depthWrite: false,
            depthTest: false,
        });

        // A simple full-screen quad to render the fragment shader on
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Resize handling
        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(containerRef.current);

        // Mouse pointer interaction (throttled)
        let targetMouse = new THREE.Vector2(-10, -10);
        const handlePointerMove = (e: PointerEvent) => {
            // Coordinate mapping to clip space
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = -(e.clientY / window.innerHeight) * 2 + 1;
            // Aspect ratio correction applied in shader
            targetMouse.set(x, y);
        };
        window.addEventListener('pointermove', handlePointerMove, { passive: true });

        // Animation Loop
        let animationFrameId: number;
        let clock = new THREE.Clock();

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

            // Lerp mouse for smooth following
            uniforms.uMouse.value.lerp(targetMouse, 0.05);
            uniforms.uTime.value = clock.getElapsedTime();

            // Audio react (feed frequency data to shader)
            if (AmbientService.isPlaying) {
                const data = AmbientService.getFrequencyData();
                let sum = 0;
                // Average the lower frequency bins for a deep pulsing effect
                for (let i = 0; i < 8; i++) sum += data[i] || 0;
                const avg = sum / 8;
                // Smooth interpolation for the uniform
                audioReactRef.current += (avg - audioReactRef.current) * 0.1;
            } else {
                audioReactRef.current += (0 - audioReactRef.current) * 0.05;
            }
            uniforms.uAudioReact.value = audioReactRef.current;

            renderer.render(scene, camera);
        };

        animate();

        // Cleanup
        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('pointermove', handlePointerMove);
            resizeObserver.disconnect();

            geometry.dispose();
            material.dispose();
            renderer.dispose();

            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-0 pointer-events-none opacity-[0.15] mix-blend-color-burn"
            style={{ filter: 'blur(30px) saturate(1.5)' }}
        />
    );
};
