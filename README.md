# 🌀 Fractal Diver

<img src="logo.svg" alt="Fractal Diver Logo" width="256" />

> **Dive into the infinite.** A high-performance, real-time 3D fractal explorer powered by WebGPU and WGSL.

Fractal Diver allows users to explore complex mathematical structures in three dimensions. Using the latest WebGPU technology and custom WGSL raymarching shaders, it renders stunning fractals with incredible detail and fluid performance. Built in [AI Studio](https://ai.studio).

---

**Author:** James Skorupski

## Features

- **Real-time 3D Raymarching**: Explore 6 distinct fractal types in full 3D:
  - Mandelbulb
  - Menger Sponge
  - Julia Set
  - Sierpinski Tetrahedron
  - Mandelbox
  - Apollonian Gasket
- **WebGPU Powered**: Leverages the next generation of web graphics with custom WGSL shaders for high-fidelity, hardware-accelerated rendering.
- **Adaptive Performance Engine**: Features a custom PD-controller that dynamically adjusts raymarching iterations and precision (epsilon) in real-time to maintain smooth framerates (30fps during interaction, prioritizing quality when settled).
- **Cinematic Camera**: Smooth, fluid navigation with zoom-aware sensitivity and SLERP-based rotations.
- **Interactive Parameters**: Fine-tune fractal shapes, scale, and mathematical constants in real-time.
- **Dynamic Slicing**: Cut through 3D structures along any axis to reveal their internal complexity.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Rendering**: WebGPU + WGSL (Custom Raymarching Engine)
- **Math/Camera**: Three.js (used for matrix math and camera state, not rendering)
- **Styling**: Tailwind CSS
- **Testing**: Vitest + Testing Library

## Controls

- **Rotate**: Left-click and drag (or 1-finger drag)
- **Pan**: Shift + Left-click and drag (or 2-finger drag)
- **Zoom**: Scroll wheel (or pinch-to-zoom)
- **Reset**: Click the "Reset" button to return to the default view

## Getting Started

### Prerequisites

- A browser with **WebGPU** support (Chrome 113+, Edge 113+, or Safari Technology Preview).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jskorupski/fractal-diver.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Testing

Run the unit test suite with Vitest:
```bash
npm test
```

## License

This project is licensed under the Apache-2.0 License.
