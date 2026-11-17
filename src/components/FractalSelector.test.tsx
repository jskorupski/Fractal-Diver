import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('selects another fractal type from the dropdown menu', async () => {
    const onFractalChange = vi.fn();
    const onResetView = vi.fn();

    render(
      <FractalSelector
        fractalType={0}
        onFractalChange={onFractalChange}
        onResetView={onResetView}
      />
    );

    const trigger = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(trigger);
    });

    const juliaOption = screen.getByRole('option', { name: FRACTAL_NAMES['2'] });
    await act(async () => {
      fireEvent.focus(juliaOption);
      fireEvent.mouseMove(juliaOption);
    });
    await act(async () => {
      fireEvent.click(juliaOption);
    });

    expect(onFractalChange).toHaveBeenCalledWith(2);
  });
});
