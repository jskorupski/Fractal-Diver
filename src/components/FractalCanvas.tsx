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

import { renderFractal } from '../shaders/fractalEngine';

// Extend R3F with standard THREE objects
extend({ Mesh, PlaneGeometry });

/**
 * Props for the FractalMesh component.
 */
interface FractalMeshProps {
  fractalType: number;
  zoom: number;
  offset: THREE.Vector3;
  rotation: THREE.Quaternion;
  isInteracting: boolean;
  interactionType: number;
  adaptiveIterations: number;        // Max iterations during interaction (targets 30fps)
  adaptiveSettledIterations: number; // Max iterations when settled (targets 15fps)
  onFrameTime?: (delta: number) => void;
  settleTime: number;
  isVisible: boolean;
  slicerEnabled: boolean;
  slicerOffset: number;
  slicerAxis: number;
  parameters: {
    qualityOffset: number;
    param1: number;
    param2: number;
    param3: number;
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
  interactionType,
  adaptiveIterations,
  adaptiveSettledIterations,
  onFrameTime,
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
  const smoothedOffset = useRef(offset.clone());
  const smoothedRotation = useRef(rotation.clone());
  
  // Target rotation as quaternion
  const targetRotation = useMemo(() => rotation.clone(), [rotation]);

  const uniforms = useMemo(() => ({
    uniformResolution: uniform(new THREE.Vector2(size.width, size.height)),
    uniformType: uniform(Math.floor(fractalType)),
    uniformZoom: uniform(zoom),
    uniformOffset: uniform(offset.clone()),
    uniformRotation: uniform(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(smoothedRotation.current))),
    uniformInteracting: uniform(isInteracting ? 1.0 : 0.0),
    uniformInteractionType: uniform(Math.floor(interactionType)),
    uniformAdaptiveIterations: uniform(adaptiveIterations),
    uniformAdaptiveSettledIterations: uniform(adaptiveSettledIterations),
    uniformSettleTime: uniform(settleTime),
    uniformSlicerEnabled: uniform(slicerEnabled ? 1.0 : 0.0),
    uniformSlicerOffset: uniform(slicerOffset),
    uniformSlicerAxis: uniform(Math.floor(slicerAxis)),
    uniformParameters: uniform(new THREE.Vector4(parameters.qualityOffset, parameters.param1, parameters.param2, parameters.param3))
  }), []);

  // Force re-render when props change
  useEffect(() => {
    if (isVisible) {
      invalidate();
    }
  }, [fractalType, zoom, offset, rotation, isInteracting, interactionType, adaptiveIterations, adaptiveSettledIterations, settleTime, slicerEnabled, slicerOffset, slicerAxis, isVisible, invalidate, parameters]);

  useEffect(() => {
    uniforms.uniformResolution.value.set(size.width, size.height);
    invalidate();
  }, [size, uniforms, invalidate]);

  useFrame((_state, delta) => {
    // Report frame time for adaptive iterations
    if (onFrameTime) {
      onFrameTime(delta);
    }

    // Smoothing factor (higher = faster response)
    // We use a frame-rate independent lerp factor
    const lerpFactor = 1.0 - Math.exp(-12 * delta);
    
    // Zoom smoothing
    smoothedZoom.current = THREE.MathUtils.lerp(smoothedZoom.current, zoom, lerpFactor);
    
    // Offset smoothing
    smoothedOffset.current.lerp(offset, lerpFactor);
    
    // Rotation smoothing (SLERP)
    smoothedRotation.current.slerp(targetRotation, lerpFactor);
    
    // Update uniforms
    uniforms.uniformType.value = Math.floor(fractalType);
    uniforms.uniformInteracting.value = isInteracting ? 1.0 : 0.0;
    uniforms.uniformInteractionType.value = Math.floor(interactionType);
    uniforms.uniformAdaptiveIterations.value = adaptiveIterations;
    uniforms.uniformAdaptiveSettledIterations.value = adaptiveSettledIterations;
    uniforms.uniformSettleTime.value = settleTime;
    uniforms.uniformZoom.value = smoothedZoom.current;
    uniforms.uniformOffset.value.copy(smoothedOffset.current);
    uniforms.uniformRotation.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(smoothedRotation.current));
    
    uniforms.uniformSlicerEnabled.value = slicerEnabled ? 1.0 : 0.0;
    uniforms.uniformSlicerOffset.value = slicerOffset;
    uniforms.uniformSlicerAxis.value = Math.floor(slicerAxis);
    uniforms.uniformParameters.value.set(parameters.qualityOffset, parameters.param1, parameters.param2, parameters.param3);
    
    // If we are still smoothing, keep invalidating
    const isStillSmoothing = 
      Math.abs(smoothedZoom.current - zoom) > 0.0001 ||
      smoothedOffset.current.distanceTo(offset) > 0.0001 ||
      smoothedRotation.current.angleTo(targetRotation) > 0.0001;
      
    if (isStillSmoothing || isInteracting) {
      invalidate();
    }
  });

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial();
    const colorNode = renderFractal({
      vUv: uv(),
      uniformResolution: uniforms.uniformResolution,
      uniformType: int(uniforms.uniformType),
      uniformZoom: uniforms.uniformZoom,
      uniformOffset: uniforms.uniformOffset,
      uniformRotation: uniforms.uniformRotation,
      uniformInteracting: uniforms.uniformInteracting,
      uniformInteractionType: int(uniforms.uniformInteractionType),
      uniformAdaptiveIterations: uniforms.uniformAdaptiveIterations,
      uniformAdaptiveSettledIterations: uniforms.uniformAdaptiveSettledIterations,
      uniformSettleTime: uniforms.uniformSettleTime,
      uniformSlicerEnabled: uniforms.uniformSlicerEnabled,
      uniformSlicerOffset: uniforms.uniformSlicerOffset,
      uniformSlicerAxis: int(uniforms.uniformSlicerAxis),
      uniformParameters: uniforms.uniformParameters
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
  offset: THREE.Vector3;
  rotation: THREE.Quaternion;
  parameters: {
    qualityOffset: number;
    param1: number;
    param2: number;
    param3: number;
  };
  isInteracting: boolean;
  interactionType: number;
  adaptiveIterations: number;        // Max iterations during interaction (targets 30fps)
  adaptiveSettledIterations: number; // Max iterations when settled (targets 15fps)
  onFrameTime?: (delta: number) => void;
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
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const rootRef = useRef<any>(null);
  const [root, setRoot] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("INITIALIZING WEBGPU...");

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const r = new WebGPURenderer({ canvas, antialias: false });
    r.setPixelRatio(window.devicePixelRatio);
    r.setSize(canvas.clientWidth, canvas.clientHeight);
    rendererRef.current = r;
    
    let active = true;
    
    // Attempt to initialize the renderer
    r.init().then(() => {
      if (!active) return;
      
      // Handle WebGPU device loss
      // The backend device lost promise resolves when the GPU device is lost
      // (e.g., due to driver crash, system sleep, or page visibility changes)
      // @ts-ignore - backend property access
      const device = r.backend?.device;
      if (device) {
        device.lost.then((info: any) => {
          console.warn(`WebGPU Device Lost: ${info.message}. Reason: ${info.reason}. Restarting renderer...`);
          if (active) {
            setStatusMessage("WEBGPU DEVICE LOST. RESTARTING...");
            // Delay slightly before retrying to avoid tight loops
            setTimeout(() => {
              if (active) setRetryCount(c => c + 1);
            }, 1000);
          }
        });
      }
      
      const r3fRoot = createRoot(canvas);
      r3fRoot.configure({
        gl: r,
        events,
        frameloop: 'demand',
        camera: { position: [0, 0, 1], fov: 50 },
        size: { width: canvas.clientWidth, height: canvas.clientHeight, top: 0, left: 0 }
      });
      
      rootRef.current = r3fRoot;
      setRoot(r3fRoot);
    }).catch(err => {
      console.error("WebGPU Initialization Failed:", err);
      setStatusMessage("WEBGPU INITIALIZATION FAILED. RETRYING...");
      // Retry after a longer delay if initialization failed completely
      setTimeout(() => {
        if (active) setRetryCount(c => c + 1);
      }, 3000);
    });

    return () => {
      active = false;
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      setRoot(null);
    };
  }, [retryCount]);

  // Handle resizing
  useEffect(() => {
    if (root && canvasRef.current) {
      const canvas = canvasRef.current;
      const handleResize = () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        // Update renderer size
        if (rendererRef.current) {
          rendererRef.current.setSize(width, height);
        }

        root.configure({
          size: { width, height, top: 0, left: 0 }
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
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm font-mono tracking-widest animate-pulse text-center px-4">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
