import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FractalSelector } from './FractalSelector';
import { FRACTAL_NAMES } from '../constants/fractals';

describe('FractalSelector', () => {
  it('renders and calls onResetView', () => {
    const onFractalChange = vi.fn();
    const onResetView = vi.fn();
    
    render(
      <FractalSelector
        fractalType={0}
        onFractalChange={onFractalChange}
        onResetView={onResetView}
      />
    );

    const resetButton = screen.getByTitle(/reset view/i);
    expect(resetButton).toBeInTheDocument();
    fireEvent.click(resetButton);
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  // Since Select component from radik uses portals and complex DOM structures,
  // we just test if the currently selected item is displayed.
  it('displays the current fractal name', () => {
    const onFractalChange = vi.fn();
    const onResetView = vi.fn();
    
    render(
      <FractalSelector
        fractalType={1}
        onFractalChange={onFractalChange}
        onResetView={onResetView}
      />
    );

    expect(screen.getByText(FRACTAL_NAMES['1'])).toBeInTheDocument();
  });
});
