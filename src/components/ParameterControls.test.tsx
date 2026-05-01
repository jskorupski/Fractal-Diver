import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ParameterToggle, ParameterPanel } from './ParameterControls';

describe('ParameterControls', () => {
  describe('ParameterToggle', () => {
    it('renders and calls onToggle', () => {
      const onToggle = vi.fn();
      render(<ParameterToggle enabled={false} onToggle={onToggle} />);
      const button = screen.getByRole('button', { name: /settings/i });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('ParameterPanel', () => {
    it('renders parameter panel and handles parameter changes', () => {
      const onUpdate = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      const params = { param1: 8.0, param2: 0.5, param3: 2.0, baseColor: '#ffffff', accentColor: '#000000' };
      
      render(
        <ParameterPanel
          fractalType={0}
          parameters={params}
          enabled={true}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      expect(screen.getByText('Fractal Parameters')).toBeInTheDocument();
      
      const paramSlider = screen.getByLabelText('Power');
      fireEvent.change(paramSlider, { target: { value: '10' } });
      
      expect(onUpdate).toHaveBeenCalledWith({ param1: 10 });
    });

    it('renders color pickers correctly', () => {
        const onUpdate = vi.fn();
        const setIsDragging = vi.fn();
        const setDraggingParam = vi.fn();
        const params = { param1: 1.5, param2: 0.5, param3: 2.0, baseColor: '#ffffff', accentColor: '#000000' };
        
        const { container } = render(
          <ParameterPanel
            fractalType={0}
            parameters={params}
            enabled={true}
            onUpdate={onUpdate}
            isDragging={false}
            draggingParam={null}
            setIsDragging={setIsDragging}
            setDraggingParam={setDraggingParam}
          />
        );
  
        const colorInputs = container.querySelectorAll('input[type="color"]');
        expect(colorInputs.length).toBe(2);
        
        fireEvent.change(colorInputs[0]!, { target: { value: '#ff0000' } });
        expect(onUpdate).toHaveBeenCalledWith({ baseColor: '#ff0000' });
      });

    it('renders julia parameters correctly', () => {
      const onUpdate = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      const params = { param1: 1.5, param2: 0.5, param3: 2.0, baseColor: '#ffffff', accentColor: '#000000' };
      
      render(
        <ParameterPanel
          fractalType={2}
          parameters={params}
          enabled={true}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      const juliaCReal = screen.getByLabelText(/c Real/i);
      fireEvent.change(juliaCReal, { target: { value: '0.6' } });
      expect(onUpdate).toHaveBeenCalledWith({ param2: 0.6 });

      const juliaCImag = screen.getByLabelText(/c Imag/i);
      fireEvent.change(juliaCImag, { target: { value: '1.5' } });
      expect(onUpdate).toHaveBeenCalledWith({ param3: 1.5 });
    });

    it('handles dragging events', () => {
      const onUpdate = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      const params = { param1: 8.0, param2: 0.5, param3: 2.0, baseColor: '#ffffff', accentColor: '#000000' };
      
      render(
        <ParameterPanel
          fractalType={0}
          parameters={params}
          enabled={true}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      const paramSlider = screen.getByLabelText('Power');
      
      fireEvent.mouseDown(paramSlider);
      expect(setIsDragging).toHaveBeenCalledWith(true);
      expect(setDraggingParam).toHaveBeenCalledWith('param1');
      
      fireEvent.mouseUp(paramSlider);
      expect(setIsDragging).toHaveBeenCalledWith(false);
      expect(setDraggingParam).toHaveBeenCalledWith(null);

      // Touch events
      fireEvent.touchStart(paramSlider);
      expect(setIsDragging).toHaveBeenCalledWith(true);

      fireEvent.touchEnd(paramSlider);
      expect(setIsDragging).toHaveBeenCalledWith(false);
    });
  });
});
