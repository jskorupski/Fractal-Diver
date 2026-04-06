import { render, screen, fireEvent } from '@testing-library/react';
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
    
    // Initially panel should not be visible or at least not expanded
    // The settings panel is rendered conditionally or with a state
    // Let's check for a specific parameter slider that should appear
    
    fireEvent.click(toggleButton);
    // After clicking, we expect to see some parameters like "Iterations"
    expect(screen.getByText(/Iterations/i)).toBeInTheDocument();
  });
});
