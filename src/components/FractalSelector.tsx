/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { FRACTAL_NAMES } from '../constants/fractals';

interface FractalSelectorProps {
  fractalType: number;
  onFractalChange: (type: number) => void;
  onResetView: () => void;
}

/**
 * FractalSelector Component.
 * Provides a dropdown for selecting the fractal type and a reset button.
 */
export const FractalSelector: React.FC<FractalSelectorProps> = ({ 
  fractalType, 
  onFractalChange, 
  onResetView 
}) => {
  return (
    <>
      {/* Fractal Selection Menu */}
      <Select 
        value={fractalType.toString()} 
        onValueChange={(value) => onFractalChange(parseInt(value, 10))}
      >
        <SelectTrigger className="flex-1 sm:flex-none w-[140px] sm:w-[160px] bg-transparent text-cyan-400 border-none focus:ring-0 font-mono uppercase tracking-wider text-[10px] sm:text-[11px] h-11 hover:text-cyan-300 transition-colors px-3 sm:px-4">
          <SelectValue>
            {FRACTAL_NAMES[fractalType.toString()]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-black/95 backdrop-blur-3xl border border-cyan-500/40 text-cyan-400 font-mono uppercase text-[11px]">
          {Object.entries(FRACTAL_NAMES).map(([val, name]) => (
            <SelectItem key={val} value={val} className="focus:bg-cyan-400 focus:text-black cursor-pointer py-3">
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Reset View Button */}
      <Button 
        onClick={onResetView} 
        variant="ghost"
        className="flex-1 sm:flex-none text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-mono uppercase tracking-widest text-[10px] sm:text-[11px] h-11 px-3 sm:px-5 border-l border-cyan-500/20 rounded-none shrink-0"
      >
        Reset
      </Button>
    </>
  );
};
