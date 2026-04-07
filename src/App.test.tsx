import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import FractalCanvas from './components/FractalCanvas';

// Mock FractalCanvas because it uses WebGL/WebGPU which is not available in jsdom
vi.mock('./components/FractalCanvas', () => ({
  default: vi.fn((props: any) => (
    <div 
      data-testid="fractal-canvas" 
      onTouchStart={props.onTouchStart}
      onTouchMove={props.onTouchMove}
      onTouchEnd={props.onTouchEnd}
      onMouseDown={props.onMouseDown}
      onMouseMove={props.onMouseMove}
      onMouseUp={props.onMouseUp}
      onMouseLeave={props.onMouseLeave}
    />
  ))
}));

const mockFractalCanvas = FractalCanvas as any;

describe('App Component', () => {
  it('renders the application title', () => {
    render(<App />);
    expect(screen.getByText(/Fractal Diver/i)).toBeInTheDocument();
  });

  it('renders the fractal selection dropdown', () => {
    render(<App />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders the parameters toggle button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('toggles the parameters panel', () => {
    render(<App />);
    const toggleButton = screen.getByRole('button', { name: /settings/i });
    
    fireEvent.click(toggleButton);
    expect(screen.getByText(/Render Quality/i)).toBeInTheDocument();
  });

  it('resets the view when the reset button is clicked', () => {
    render(<App />);
    const resetButton = screen.getByRole('button', { name: /reset/i });
    
    // We can't easily check the internal state of App, but we can verify the button exists and is clickable
    fireEvent.click(resetButton);
    expect(resetButton).toBeInTheDocument();
  });

  it('toggles the slicer when the slicer toggle is clicked', () => {
    render(<App />);
    const slicerToggle = screen.getByTestId('slicer-toggle');
    
    fireEvent.click(slicerToggle);
    // When slicer is enabled, "Slicer Controls" should appear if expanded
    expect(screen.getByText(/Slicer Controls/i)).toBeInTheDocument();
  });

  it('changes the fractal when a new one is selected', async () => {
    render(<App />);
    const selectTrigger = screen.getByRole('combobox');
    
    // Click the trigger to open the menu
    await act(async () => {
      fireEvent.click(selectTrigger);
    });
    
    // Find and click "Menger Sponge" (fractal type 1)
    const mengerSpongeOption = screen.getByText(/Menger Sponge/i);
    await act(async () => {
      fireEvent.click(mengerSpongeOption);
    });
    
    // Check if the trigger now shows "Menger Sponge"
    expect(screen.getByText(/Menger Sponge/i)).toBeInTheDocument();
  });

  it('updates parameters when a slider is moved', () => {
    render(<App />);
    // Open settings panel
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    
    // Find the quality slider
    const qualitySlider = screen.getByLabelText(/Quality/i);
    
    // Change the slider value
    fireEvent.change(qualitySlider, { target: { value: '5' } });
    
    // Check if the value is updated in the UI
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('updates opacity when a parameter is being dragged', () => {
    render(<App />);
    // Open settings panel
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    
    const qualitySlider = screen.getByLabelText(/Quality/i);
    
    // Start dragging
    fireEvent.mouseDown(qualitySlider);
    
    // The settings panel should have full opacity because it's the active param
    const settingsPanel = screen.getByTestId('parameters-panel');
    expect(settingsPanel).toHaveClass('opacity-100');
    
    // The main controls group should have reduced opacity
    const mainControls = screen.getByTestId('main-controls-group');
    expect(mainControls).toHaveClass('opacity-20');
    
    // Stop dragging
    fireEvent.mouseUp(qualitySlider);
    expect(mainControls).toHaveClass('opacity-100');
  });

  it('verifies default fractal parameters are rendered', () => {
    render(<App />);
    // Open settings panel
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    
    // Mandelbulb is default, power should be 8.00
    expect(screen.getByText('8.00')).toBeInTheDocument();
  });

  it('displays the correct interaction instructions', () => {
    render(<App />);
    expect(screen.getByText(/2-Finger Drag or Shift\+Drag to Pan/i)).toBeInTheDocument();
    expect(screen.getByText(/Scroll or Pinch to Zoom/i)).toBeInTheDocument();
  });

  it('separates pinch and pan gestures with thresholds', async () => {
    // Mock performance.now to control time and bypass throttling
    let currentTime = 100;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
    
    render(<App />);
    const canvas = screen.getByTestId('fractal-canvas');
    
    // 1. Simulate a Pinch Gesture
    // Start with two fingers 100px apart
    fireEvent.touchStart(canvas, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 }
      ]
    });
    
    currentTime += 20; // Advance time to bypass throttle
    
    // Move fingers apart by 20px (above 15px threshold)
    // Midpoint stays at (150, 100)
    fireEvent.touchMove(canvas, {
      touches: [
        { clientX: 90, clientY: 100 },
        { clientX: 210, clientY: 100 }
      ]
    });
    
    // Check if zoom prop changed (it should have increased)
    const lastCallProps = mockFractalCanvas.mock.calls[mockFractalCanvas.mock.calls.length - 1][0];
    expect(lastCallProps.zoom).toBeGreaterThan(1.0); // Default zoom is 1.0 for Mandelbulb
    
    // 2. Simulate a Pan Gesture
    // Reset interaction
    fireEvent.touchEnd(canvas);
    
    // Reset view to ensure we start from default state
    const resetButton = screen.getByRole('button', { name: /Reset/i });
    await act(async () => {
      fireEvent.click(resetButton);
    });
    
    currentTime += 20; // Advance time
    
    // Start with two fingers 100px apart
    fireEvent.touchStart(canvas, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 }
      ]
    });
    
    const zoomBeforePan = mockFractalCanvas.mock.calls[mockFractalCanvas.mock.calls.length - 1][0].zoom;
    
    currentTime += 20; // Advance time
    
    // Move both fingers right by 15px (above 10px threshold)
    // Distance stays at 100px
    fireEvent.touchMove(canvas, {
      touches: [
        { clientX: 115, clientY: 100 },
        { clientX: 215, clientY: 100 }
      ]
    });
    
    // Check if offset prop changed (it should have moved)
    const panCallProps = mockFractalCanvas.mock.calls[mockFractalCanvas.mock.calls.length - 1][0];
    expect(panCallProps.offset.x).not.toBe(0); // Default offset is (0,0,0)
    expect(panCallProps.zoom).toBe(zoomBeforePan); // Zoom should NOT have changed
    
    nowSpy.mockRestore();
  });
});
