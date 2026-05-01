import { useState, useEffect, useRef } from 'react';
import { Bug, X } from 'lucide-react';

interface DebugPanelProps {
  expanded: boolean;
  onClose: () => void;
  currentInteractiveIterations: number;
  currentSettledIterations: number;
  settleTimeRef: React.MutableRefObject<number>;
  fractalType: number;
  renderCountRef: React.MutableRefObject<number>;
  fpsRef: React.MutableRefObject<number>;
  performanceKnobs: {
    interactiveSteps: number;
    settledSteps: number;
    interactiveEpsilon: number;
    settledEpsilon: number;
  };
  onUpdateKnobs: (knobs: {
    interactiveIterations?: number;
    settledIterations?: number;
    interactiveSteps?: number;
    settledSteps?: number;
    interactiveEpsilon?: number;
    settledEpsilon?: number;
  }) => void;
}

export default function DebugPanel({ 
  expanded,
  onClose,
  currentInteractiveIterations, 
  currentSettledIterations, 
  settleTimeRef, 
  fractalType, 
  renderCountRef, 
  fpsRef,
  performanceKnobs,
  onUpdateKnobs
}: DebugPanelProps) {
  const [values, setValues] = useState({
    interactive: 0,
    settled: 0,
    interactiveEpsilon: 0,
    settledEpsilon: 0,
    interactiveSteps: 0,
    settledSteps: 0,
    settleProgress: 0,
    fps: 0,
    renderCount: 0,
  });
  const requestRef = useRef<number>(0);
  
  // Use a ref to hold the latest props so requestAnimationFrame doesn't use a stale closure
  const propsRef = useRef({ 
    currentInteractiveIterations, 
    currentSettledIterations, 
    performanceKnobs,
    fractalType 
  });

  useEffect(() => {
    propsRef.current = { 
      currentInteractiveIterations, 
      currentSettledIterations, 
      performanceKnobs,
      fractalType 
    };
  }, [currentInteractiveIterations, currentSettledIterations, performanceKnobs, fractalType]);

  const isSettled = values.settleProgress >= 1.0;

  const updateValues = () => {
    const currentProps = propsRef.current;
    setValues({
      interactive: currentProps.currentInteractiveIterations,
      settled: currentProps.currentSettledIterations,
      interactiveEpsilon: currentProps.performanceKnobs.interactiveEpsilon,
      settledEpsilon: currentProps.performanceKnobs.settledEpsilon,
      interactiveSteps: currentProps.performanceKnobs.interactiveSteps,
      settledSteps: currentProps.performanceKnobs.settledSteps,
      settleProgress: settleTimeRef.current,
      fps: fpsRef.current,
      renderCount: renderCountRef.current,
    });
  };

  useEffect(() => {
    const interval = setInterval(updateValues, 500);
    return () => clearInterval(interval);
  }, []);

  if (!expanded) return null;

  // Spinner characters for the frame counter
  const spinnerChars = ['|', '/', '-', '\\'];
  const spinner = spinnerChars[values.renderCount % spinnerChars.length];

  return (
    <div className="fixed top-16 right-4 sm:top-20 sm:right-6 w-64 bg-black/80 text-white p-4 rounded-xl backdrop-blur-2xl z-50 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-cyan-500/20">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Bug size={14} /> Debug
        </h3>
        <button onClick={onClose} className="hover:text-gray-300">
          <X size={16} />
        </button>
      </div>
      <div className="text-xs font-mono space-y-2">
        <p className="text-cyan-400/70 border-b border-white/10 pb-1 mb-2">CORE METRICS</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <span>Fractal:</span> <span className="text-right">{fractalType}</span>
          <span>FPS:</span> <span className="text-right">{values.fps} {spinner}</span>
          <span>Settle:</span> <span className="text-right">{(values.settleProgress * 100).toFixed(0)}%</span>
        </div>

        <p className="text-cyan-400/70 border-b border-white/10 pb-1 mt-3 mb-2">EPSILON (PRECISION)</p>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label>Interactive:</label>
            <input 
              type="number" 
              step="0.0001"
              value={values.interactiveEpsilon.toFixed(5)}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ interactiveEpsilon: Math.max(0.000001, parseFloat(e.target.value) || 0.001) })}
              className={`w-20 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex justify-between items-center">
            <label>Settled:</label>
            <input 
              type="number" 
              step="0.00001"
              value={values.settledEpsilon.toFixed(6)}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ settledEpsilon: Math.max(0.000001, parseFloat(e.target.value) || 0.0001) })}
              className={`w-20 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>

        <p className="text-cyan-400/70 border-b border-white/10 pb-1 mt-3 mb-2">ITERATIONS</p>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label>Interactive:</label>
            <input 
              type="number" 
              min="1"
              value={values.interactive.toFixed(0)}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ interactiveIterations: Math.max(1, parseFloat(e.target.value) || 1) })}
              className={`w-16 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex justify-between items-center">
            <label>Settled:</label>
            <input 
              type="number" 
              min="1"
              value={values.settled.toFixed(0)}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ settledIterations: Math.max(1, parseFloat(e.target.value) || 1) })}
              className={`w-16 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>

        <p className="text-cyan-400/70 border-b border-white/10 pb-1 mt-3 mb-2">RAYMARCHING</p>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label>Int. Steps:</label>
            <input 
              type="number" 
              min="1"
              value={values.interactiveSteps}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ interactiveSteps: Math.max(1, parseInt(e.target.value) || 1) })}
              className={`w-16 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div className="flex justify-between items-center">
            <label>Set. Steps:</label>
            <input 
              type="number" 
              min="1"
              value={values.settledSteps}
              readOnly={!isSettled}
              onChange={(e) => onUpdateKnobs({ settledSteps: Math.max(1, parseInt(e.target.value) || 1) })}
              className={`w-16 bg-white/5 border border-white/10 rounded px-1 text-right outline-none focus:border-cyan-500/50 ${!isSettled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
