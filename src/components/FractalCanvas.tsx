/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRoot, events, useFrame, useThree, extend } from '@react-three/fiber';
import { useMemo, useRef, useEffect, useState, TouchEvent as ReactTouchEvent } from 'react';
import * as THREE from 'three';
import { Mesh, PlaneGeometry } from 'three';

import { 
  WebGPURenderer, 
  MeshBasicNodeMaterial
} from 'three/webgpu';
import { 
  uniform, 
  uv,
  int
} from 'three/tsl';

import { fractalEngine } from '../shaders/fractalEngine';

// Extend R3F with standard THREE objects
extend({ Mesh, PlaneGeometry });

/**
 * Props for the FractalMesh component.
 */
interface FractalMeshProps {
  fractalType: number;
  zoom: number;
  offset: [number, number];
  rotation: THREE.Euler;
  isInteracting: boolean;
  settleTime: number;
  isVisible: boolean;
  slicerEnabled: boolean;
  slicerOffset: number;
  slicerAxis: number;
  parameters: {
    iterations: number;
    p1: number;
    p2: number;
    p3: number;
  };
}

/**
 * FractalMesh Component.
 * This component is responsible for rendering the fractal using WebGPU and TSL.
 * It implements camera smoothing and handles the transition between interactive
 * and settled rendering states.
 */
function FractalMesh({ 
  fractalType, 
  zoom, 
  offset, 
  rotation, 
  isInteracting,
  settleTime,
  isVisible,
  slicerEnabled,
  slicerOffset,
  slicerAxis,
  parameters
}: FractalMeshProps) {
  const { size, viewport, invalidate } = useThree();
  const materialRef = useRef<MeshBasicNodeMaterial>(null);
  
  // Refs for smoothed values
  const smoothedZoom = useRef(zoom);
  const smoothedOffset = useRef(new THREE.Vector2(offset[0], offset[1]));
  const smoothedRotation = useRef(new THREE.Quaternion().setFromEuler(rotation));
  
  // Target rotation as quaternion
  const targetRotation = useMemo(() => new THREE.Quaternion().setFromEuler(rotation), [rotation]);

  const uniforms = useMemo(() => ({
    uRes: uniform(new THREE.Vector2(size.width, size.height)),
    uType: uniform(Math.floor(fractalType)),
    uZoom: uniform(zoom),
    uOff: uniform(new THREE.Vector2(offset[0], offset[1])),
    uRot: uniform(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(smoothedRotation.current))),
    uInteracting: uniform(isInteracting ? 1.0 : 0.0),
    uSettleTime: uniform(settleTime),
    uSlicerEnabled: uniform(slicerEnabled ? 1.0 : 0.0),
    uSlicerOffset: uniform(slicerOffset),
    uSlicerAxis: uniform(Math.floor(slicerAxis)),
    uParams: uniform(new THREE.Vector4(parameters.iterations, parameters.p1, parameters.p2, parameters.p3))
  }), []);

  // Force re-render when props change
  useEffect(() => {
    if (isVisible) {
      invalidate();
    }
  }, [fractalType, zoom, offset, rotation, isInteracting, settleTime, slicerEnabled, slicerOffset, slicerAxis, isVisible, invalidate, parameters]);

  useEffect(() => {
    uniforms.uRes.value.set(size.width, size.height);
    invalidate();
  }, [size, uniforms, invalidate]);

  useFrame((_state, delta) => {
    // Smoothing factor (higher = faster response)
    // We use a frame-rate independent lerp factor
    const lerpFactor = 1.0 - Math.exp(-12 * delta);
    
    // Zoom smoothing
    smoothedZoom.current = THREE.MathUtils.lerp(smoothedZoom.current, zoom, lerpFactor);
    
    // Offset smoothing
    smoothedOffset.current.lerp(new THREE.Vector2(offset[0], offset[1]), lerpFactor);
    
    // Rotation smoothing (SLERP)
    smoothedRotation.current.slerp(targetRotation, lerpFactor);
    
    // Update uniforms
    uniforms.uType.value = Math.floor(fractalType);
    uniforms.uInteracting.value = isInteracting ? 1.0 : 0.0;
    uniforms.uSettleTime.value = settleTime;
    uniforms.uZoom.value = smoothedZoom.current;
    uniforms.uOff.value.copy(smoothedOffset.current);
    uniforms.uRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(smoothedRotation.current));
    
    uniforms.uSlicerEnabled.value = slicerEnabled ? 1.0 : 0.0;
    uniforms.uSlicerOffset.value = slicerOffset;
    uniforms.uSlicerAxis.value = Math.floor(slicerAxis);
    uniforms.uParams.value.set(parameters.iterations, parameters.p1, parameters.p2, parameters.p3);
    
    // If we are still smoothing, keep invalidating
    const isStillSmoothing = 
      Math.abs(smoothedZoom.current - zoom) > 0.0001 ||
      smoothedOffset.current.distanceTo(new THREE.Vector2(offset[0], offset[1])) > 0.0001 ||
      smoothedRotation.current.angleTo(targetRotation) > 0.0001;
      
    if (isStillSmoothing || isInteracting) {
      invalidate();
    }
  });

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial();
    const colorNode = fractalEngine({
      vUv: uv(),
      uRes: uniforms.uRes,
      uType: int(uniforms.uType),
      uZoom: uniforms.uZoom,
      uOff: uniforms.uOff,
      uRot: uniforms.uRot,
      uInteracting: uniforms.uInteracting,
      uSettleTime: uniforms.uSettleTime,
      uSlicerEnabled: uniforms.uSlicerEnabled,
      uSlicerOffset: uniforms.uSlicerOffset,
      uSlicerAxis: int(uniforms.uSlicerAxis),
      uParams: uniforms.uParams
    });
    mat.colorNode = colorNode as any;
    return mat;
  }, [uniforms]);

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}

/**
 * Props for the FractalCanvas component.
 */
interface FractalCanvasProps {
  fractalType: number;
  zoom: number;
  offset: [number, number];
  rotation: THREE.Euler;
  parameters: {
    iterations: number;
    p1: number;
    p2: number;
    p3: number;
  };
  isInteracting: boolean;
  settleTime: number;
  isVisible: boolean;
  slicerEnabled: boolean;
  slicerOffset: number;
  slicerAxis: number;
  onTouchStart: (e: ReactTouchEvent) => void;
  onTouchMove: (e: ReactTouchEvent) => void;
  onTouchEnd: (e: ReactTouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

/**
 * FractalCanvas Component.
 * Integrates WebGPURenderer with React Three Fiber using createRoot.
 */
export default function FractalCanvas(props: FractalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [root, setRoot] = useState<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const r = new WebGPURenderer({ canvas, antialias: false });
    
    let active = true;
    r.init().then(() => {
      if (!active) return;
      
      const r3fRoot = createRoot(canvas);
      r3fRoot.configure({
        gl: r,
        events,
        frameloop: 'demand',
        camera: { position: [0, 0, 1], fov: 50 },
        size: { width: canvas.clientWidth, height: canvas.clientHeight, top: 0, left: 0 }
      });
      
      setRoot(r3fRoot);
    }).catch(err => {
      console.error("WebGPU Initialization Failed:", err);
    });

    return () => {
      active = false;
      if (root) {
        root.unmount();
      }
    };
  }, []);

  // Handle resizing
  useEffect(() => {
    if (root && canvasRef.current) {
      const canvas = canvasRef.current;
      const handleResize = () => {
        root.configure({
          size: { width: canvas.clientWidth, height: canvas.clientHeight, top: 0, left: 0 }
        });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [root]);

  // Render the scene
  useEffect(() => {
    if (root) {
      root.render(
        <FractalMesh {...props} />
      );
    }
  }, [root, props]);

  return (
    <div className="w-full h-full bg-black relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        onTouchStart={props.onTouchStart}
        onTouchMove={props.onTouchMove}
        onTouchEnd={props.onTouchEnd}
        onMouseDown={props.onMouseDown}
        onMouseMove={props.onMouseMove}
        onMouseUp={props.onMouseUp}
        onMouseLeave={props.onMouseLeave}
      />
      {!root && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm font-mono tracking-widest animate-pulse">
          INITIALIZING WEBGPU...
        </div>
      )}
    </div>
  );
}
