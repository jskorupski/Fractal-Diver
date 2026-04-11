/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface InteractionInstructionsProps {
  isDragging: boolean;
}

/**
 * InteractionInstructions Component.
 * Displays helpful hints for navigating the fractal scene.
 */
export const InteractionInstructions: React.FC<InteractionInstructionsProps> = ({ isDragging }) => {
  return (
    <div className={`absolute top-4 left-4 sm:top-8 sm:left-8 z-10 flex flex-col gap-1.5 pointer-events-none transition-opacity duration-500 ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
      <h1 className="text-cyan-400 font-mono font-bold uppercase tracking-[0.4em] text-xs sm:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
        Fractal Diver
      </h1>
      <div className="h-[1px] w-12 bg-cyan-500/50" />
      <div className="flex flex-col gap-0.5">
        <div className="text-cyan-500/40 text-[8px] sm:text-[9px] uppercase font-mono tracking-[0.2em]">
          Drag to Rotate • 2-Finger Drag or Shift+Drag to Pan
        </div>
        <div className="text-cyan-500/40 text-[8px] sm:text-[9px] uppercase font-mono tracking-[0.2em]">
          Scroll or Pinch to Zoom
        </div>
      </div>
    </div>
  );
};
