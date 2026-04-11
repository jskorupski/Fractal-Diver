/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface SlicerToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * SlicerToggle Component.
 * The switch rendered in the main toolbar.
 */
export const SlicerToggle: React.FC<SlicerToggleProps> = ({ enabled, onToggle }) => {
  return (
    <div className="flex-1 sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 border-l border-cyan-500/20 h-11 shrink-0">
      <div 
        data-testid="slicer-toggle"
        onClick={onToggle}
        className={`w-8 sm:w-10 h-4 sm:h-5 rounded-full relative cursor-pointer transition-colors duration-300 ${enabled ? 'bg-cyan-500' : 'bg-gray-800'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-3 sm:w-4 h-3 sm:h-4 rounded-full bg-white transition-transform duration-300 ${enabled ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-tight ${enabled ? 'text-cyan-400' : 'text-gray-500'}`}>
        Slicer
      </span>
    </div>
  );
};

interface SlicerPanelProps {
  enabled: boolean;
  offset: number;
  axis: number;
  expanded: boolean;
  onExpandToggle: () => void;
  onUpdate: (updates: { offset?: number; axis?: number }) => void;
  isDragging: boolean;
  draggingParam: string | null;
  setIsDragging: (dragging: boolean) => void;
  setDraggingParam: (param: string | null) => void;
}

/**
 * SlicerPanel Component.
 * The detailed parameter panel for the slicer.
 */
export const SlicerPanel: React.FC<SlicerPanelProps> = ({
  enabled,
  offset,
  axis,
  expanded,
  onExpandToggle,
  onUpdate,
  isDragging,
  draggingParam,
  setIsDragging,
  setDraggingParam
}) => {
  if (!enabled) return null;

  return (
    <div className={`w-full sm:w-72 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden transition-opacity max-h-[30vh] sm:max-h-[40vh] overflow-y-auto ${isDragging && draggingParam !== 'slicer' ? 'opacity-20' : 'opacity-100'}`}>
      <div 
        className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={onExpandToggle}
      >
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full bg-cyan-500 ${enabled ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-[0.2em]">Slicer Controls</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-cyan-500" /> : <ChevronRight className="w-4 h-4 text-cyan-500" />}
      </div>

      {expanded && (
        <div className="p-5 flex flex-col gap-5">
          {/* Axis Selection */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono uppercase text-cyan-500/70 tracking-[0.2em]">Axis</span>
            <div className="flex gap-1.5">
              {[
                { id: 0, label: 'X' },
                { id: 1, label: 'Y' },
                { id: 2, label: 'Z' }
              ].map((a) => (
                <button
                  key={a.id}
                  onClick={() => onUpdate({ axis: a.id })}
                  className={`flex-1 py-2 rounded-lg font-mono text-[10px] sm:text-[11px] uppercase transition-all duration-300 border ${
                    axis === a.id 
                      ? 'bg-cyan-500/30 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                      : 'bg-transparent border-cyan-500/10 text-gray-500 hover:border-cyan-500/30'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Offset Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase text-cyan-500/70 tracking-[0.2em]">Shift</span>
              <span className="text-[11px] font-mono text-cyan-400 tabular-nums">{offset.toFixed(2)}</span>
            </div>
            <div className="relative h-8 flex items-center">
              <div className="absolute w-full h-[2px] bg-cyan-500/20" />
              <input 
                type="range" 
                aria-label="Slicer Offset"
                min="-2" 
                max="2" 
                step="0.01"
                value={offset}
                onMouseDown={() => { setIsDragging(true); setDraggingParam('slicer'); }}
                onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                onTouchStart={() => { setIsDragging(true); setDraggingParam('slicer'); }}
                onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                onChange={(e) => onUpdate({ offset: parseFloat(e.target.value) })}
                className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-cyan-400 relative z-10"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
