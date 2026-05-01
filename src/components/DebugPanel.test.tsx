import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DebugPanel from './DebugPanel';

describe('DebugPanel', () => {
  const defaultProps = {
    expanded: true,
    onClose: vi.fn(),
    currentInteractiveIterations: 10,
    currentSettledIterations: 20,
    settleTimeRef: { current: 1.0 },
    fractalType: 0,
    renderCountRef: { current: 100 },
    fpsRef: { current: 60 },
    performanceKnobs: {
      interactiveSteps: 50,
      settledSteps: 100,
      interactiveEpsilon: 0.001,
      settledEpsilon: 0.0001,
    },
    onUpdateKnobs: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('renders nothing when not expanded', () => {
    render(<DebugPanel {...defaultProps} expanded={false} />);
    expect(screen.queryByText('Debug')).not.toBeInTheDocument();
  });

  it('renders panel and updates values', () => {
    render(<DebugPanel {...defaultProps} />);
    
    expect(screen.getByText('Debug')).toBeInTheDocument();
    
    act(() => {
        vi.advanceTimersByTime(600);
    });

    expect(screen.getByText('60 |')).toBeInTheDocument();
  });

  it('handles input changes', () => {
    render(<DebugPanel {...defaultProps} />);

    act(() => {
        vi.advanceTimersByTime(600); // Trigger update
    });

    const epsInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(epsInput, { target: { value: '0.002' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ interactiveEpsilon: 0.002 });
    
    // Test others
    const settledEpsInput = screen.getAllByRole('spinbutton')[1];
    fireEvent.change(settledEpsInput, { target: { value: '0.0002' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ settledEpsilon: 0.0002 });

    const interIterInput = screen.getAllByRole('spinbutton')[2];
    fireEvent.change(interIterInput, { target: { value: '15' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ interactiveIterations: 15 });

    const settledIterInput = screen.getAllByRole('spinbutton')[3];
    fireEvent.change(settledIterInput, { target: { value: '30' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ settledIterations: 30 });

    const interSteps = screen.getAllByRole('spinbutton')[4];
    fireEvent.change(interSteps, { target: { value: '60' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ interactiveSteps: 60 });
    
    const setSteps = screen.getAllByRole('spinbutton')[5];
    fireEvent.change(setSteps, { target: { value: '120' } });
    expect(defaultProps.onUpdateKnobs).toHaveBeenCalledWith({ settledSteps: 120 });
  });

  it('calls onClose when closed', () => {
    render(<DebugPanel {...defaultProps} />);
    const closeButton = screen.getAllByRole('button')[0];
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
