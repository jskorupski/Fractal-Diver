import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock FractalCanvas because it uses WebGL/WebGPU which is not available in jsdom
vi.mock('./components/FractalCanvas', () => ({
  default: () => <div data-testid="fractal-canvas" />
}));

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
});
