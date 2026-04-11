/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from './ui/button';

interface ParameterToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * ParameterToggle Component.
 * The settings button rendered in the main toolbar.
 */
export const ParameterToggle: React.FC<ParameterToggleProps> = ({ enabled, onToggle }) => {
  return (
    <Button 
      onClick={onToggle} 
      variant="ghost"
      aria-label="Settings"
      className={`w-11 h-11 p-0 flex items-center justify-center border-l border-cyan-500/20 rounded-none transition-colors shrink-0 ${enabled ? 'text-cyan-300 bg-cyan-500/20' : 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10'}`}
    >
      <Settings2 className="w-4 h-4" />
    </Button>
  );
};

interface ParameterPanelProps {
  fractalType: number;
  parameters: {
    param1: number;
    param2: number;
    param3: number;
  };
  enabled: boolean;
  onUpdate: (updates: { param1?: number; param2?: number; param3?: number }) => void;
  isDragging: boolean;
  draggingParam: string | null;
  setIsDragging: (dragging: boolean) => void;
  setDraggingParam: (param: string | null) => void;
}

/**
 * ParameterPanel Component.
 * The detailed sliders for fractal-specific parameters.
 */
export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  fractalType,
  parameters,
  enabled,
  onUpdate,
  isDragging,
  draggingParam,
  setIsDragging,
  setDraggingParam
}) => {
  if (!enabled) return null;

  return (
    <div 
      data-testid="parameters-panel"
      className={`w-full sm:w-80 p-4 sm:p-5 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 transition-opacity max-h-[40dvh] sm:max-h-[60dvh] overflow-y-auto ${isDragging && !draggingParam ? 'opacity-20' : 'opacity-100'}`}
    >
      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-3">
          <Settings2 className="w-3 h-3 text-cyan-500" />
          <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-[0.2em]">Fractal Parameters</span>
        </div>

        {/* Dynamic Parameter 1 */}
        {fractalType !== 2 && ( // Julia uses p2, p3
          <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'param1' ? 'opacity-20' : 'opacity-100'}`}>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                {fractalType === 0 ? 'Power' : (fractalType === 1 || fractalType === 3 || fractalType === 4) ? 'Scale' : 'Param 1'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400">{parameters.param1.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              aria-label={fractalType === 0 ? 'Power' : (fractalType === 1 || fractalType === 3 || fractalType === 4) ? 'Scale' : 'Param 1'}
              min={fractalType === 0 ? "2" : "1"} 
              max={fractalType === 0 ? "20" : (fractalType === 1 ? "12" : "5")} 
              step="0.01"
              value={parameters.param1}
              onMouseDown={() => { setIsDragging(true); setDraggingParam('param1'); }}
              onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
              onTouchStart={() => { setIsDragging(true); setDraggingParam('param1'); }}
              onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
              onChange={(e) => onUpdate({ param1: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
            />
          </div>
        )}

        {/* Dynamic Parameter 2 & 3 (Julia C or Mandelbox Radius) */}
        {(fractalType === 2 || fractalType === 4) && (
          <>
            <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'param2' ? 'opacity-20' : 'opacity-100'}`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                  {fractalType === 2 ? 'C Real' : 'Min Radius'}
                </span>
                <span className="text-[10px] font-mono text-cyan-400">{parameters.param2.toFixed(3)}</span>
              </div>
              <input 
                type="range" 
                aria-label={fractalType === 2 ? 'C Real' : 'Min Radius'}
                min={fractalType === 2 ? "-2" : "0.01"} 
                max={fractalType === 2 ? "2" : "2"} 
                step="0.001"
                value={parameters.param2}
                onMouseDown={() => { setIsDragging(true); setDraggingParam('param2'); }}
                onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                onTouchStart={() => { setIsDragging(true); setDraggingParam('param2'); }}
                onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                onChange={(e) => onUpdate({ param2: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
              />
            </div>
            <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'param3' ? 'opacity-20' : 'opacity-100'}`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                  {fractalType === 2 ? 'C Imag' : 'Fixed Radius'}
                </span>
                <span className="text-[10px] font-mono text-cyan-400">{parameters.param3.toFixed(3)}</span>
              </div>
              <input 
                type="range" 
                aria-label={fractalType === 2 ? 'C Imag' : 'Fixed Radius'}
                min={fractalType === 2 ? "-2" : "0.1"} 
                max={fractalType === 2 ? "2" : "3"} 
                step="0.001"
                value={parameters.param3}
                onMouseDown={() => { setIsDragging(true); setDraggingParam('param3'); }}
                onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                onTouchStart={() => { setIsDragging(true); setDraggingParam('param3'); }}
                onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                onChange={(e) => onUpdate({ param3: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
