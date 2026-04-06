# 🌀 Fractal Diver

<img src="logo.svg" alt="Fractal Diver Logo" width="256" />

> **Dive into the infinite.** A high-performance, real-time 3D fractal explorer powered by WebGPU and Three.js.

Fractal Diver allows users to explore complex mathematical structures in three dimensions. Using the latest WebGPU technology via Three.js TSL (Three Shading Language), it renders stunning fractals with incredible detail and fluid performance. Built in [AI Studio](https://ai.studio).

---

**Author:** James Skorupski

## Features

- **Real-time 3D Raymarching**: Explore fractals like the Mandelbulb, Menger Sponge, and Mandelbox in full 3D.
- **WebGPU Powered**: Leverages the next generation of web graphics for high-fidelity rendering.
- **Cinematic Camera**: Smooth, fluid navigation with zoom-aware sensitivity and SLERP-based rotations.
- **Interactive Parameters**: Fine-tune fractal shapes, iteration depth, and mathematical constants in real-time.
- **Dynamic Slicing**: Cut through 3D structures to reveal their internal complexity.
- **Progressive Detail**: Intelligently balances performance during interaction and visual quality when settled.

## Tech Stack

- **Frontend**: React + TypeScript
- **Rendering**: Three.js + WebGPU (TSL)
- **Styling**: Tailwind CSS
- **Motion**: Framer Motion (motion/react)
- **Testing**: Vitest + Testing Library

## Controls

- **Rotate**: Left-click and drag
- **Pan**: Shift + Left-click and drag (or three-finger touch)
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

