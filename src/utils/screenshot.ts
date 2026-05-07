import * as THREE from 'three';
import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu';
import { uniform, uv, int } from 'three/tsl';
import { renderFractal } from '../shaders/fractalEngine';

export const takeWallpaperScreenshot = async (props: any) => {
    // scale for supersampling, but cap resolution to avoid exceeding WebGPU texture limits (~8192)
    const nativeWidth = window.screen.width * window.devicePixelRatio;
    const nativeHeight = window.screen.height * window.devicePixelRatio;
    
    // We can add a small supersample factor that scales down, but we shouldn't overkill it
    // especially since mobile devicePixelRatios are already quite high.
    const maxDimension = Math.max(nativeWidth, nativeHeight);
    
    // Default to 1x on high-DPI displays (like mobile devices) to avoid extreme hang times.
    // Default to 2x on regular desktop monitors.
    let scale = window.devicePixelRatio >= 2 ? 1 : 2;
    
    // Cap at 3840 (approx 4K) maximum dimension to avoid mobile GPU hangs
    if (maxDimension * scale > 3840) {
        scale = Math.max(1, 3840 / maxDimension); 
    }
    
    const finalWidth = nativeWidth;
    const finalHeight = nativeHeight;
    const renderWidth = finalWidth * scale;
    const renderHeight = finalHeight * scale;

    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = renderWidth;
    renderCanvas.height = renderHeight;

    const renderer = new WebGPURenderer({ canvas: renderCanvas, antialias: false, alpha: false });
    renderer.setSize(renderWidth, renderHeight, false);
    await renderer.init();

    const uniforms = {
        uniformResolution: uniform(new THREE.Vector2(renderWidth, renderHeight)),
        uniformType: int(Math.floor(props.fractalType)),
        uniformZoom: uniform(props.zoom),
        uniformOffset: uniform(props.offset),
        uniformRotation: uniform(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(props.rotation))),
        uniformInteracting: uniform(0.0),
        uniformInteractionType: int(0),
        // Use the exact same parameters as the settled view to maintain the same visual look
        uniformAdaptiveIterations: uniform(props.adaptiveSettledIterations), 
        uniformAdaptiveSettledIterations: uniform(props.adaptiveSettledIterations),
        uniformSettleTime: uniform(1.0),
        uniformInteractiveSteps: uniform(props.interactiveSteps),
        uniformSettledSteps: uniform(props.settledSteps),
        uniformInteractiveEpsilon: uniform(props.interactiveEpsilon),
        uniformSettledEpsilon: uniform(props.settledEpsilon),
        uniformSlicerEnabled: uniform(props.slicerEnabled ? 1.0 : 0.0),
        uniformSlicerOffset: uniform(props.slicerOffset),
        uniformSlicerAxis: int(props.slicerAxis),
        uniformParameters: uniform(new THREE.Vector4(props.parameters.qualityOffset, props.parameters.param1, props.parameters.param2, props.parameters.param3)),
        uniformBaseColor: uniform(new THREE.Color(props.parameters.baseColor || "#ffffff")),
        uniformAccentColor: uniform(new THREE.Color(props.parameters.accentColor || "#ffffff"))
    };

    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = renderFractal({
      vUv: uv(),
      ...uniforms
    }) as any;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, mat);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5, 5);

    await renderer.renderAsync(scene, camera);

    // Yield to let WebGPU present the frame to the canvas
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Downsample using a standard 2D canvas
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = finalWidth;
    finalCanvas.height = finalHeight;
    const ctx = finalCanvas.getContext('2d');
    
    if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(renderCanvas, 0, 0, finalWidth, finalHeight);
    }

    // download
    return new Promise<void>((resolve, reject) => {
        (ctx ? finalCanvas : renderCanvas).toBlob((blob) => {
            // cleanup resources immediately
            mat.dispose();
            geometry.dispose();
            scene.remove(mesh);
            renderer.dispose();
            
            if (!blob) {
                reject(new Error("Failed to create blob from HD canvas"));
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fractal-diver-wallpaper-${Date.now()}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
            
            resolve();
        }, 'image/jpeg', 0.95);
    });
};
