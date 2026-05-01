import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SlicerToggle, SlicerPanel } from './SlicerControls';

describe('SlicerControls', () => {
  describe('SlicerToggle', () => {
    it('renders and calls onToggle', () => {
      const onToggle = vi.fn();
      render(<SlicerToggle enabled={false} onToggle={onToggle} />);
      const toggleBox = screen.getByTestId('slicer-toggle');
      expect(toggleBox).toBeInTheDocument();
      fireEvent.click(toggleBox);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('SlicerPanel', () => {
    it('renders slicer panel when enabled', () => {
      const onUpdate = vi.fn();
      const onExpandToggle = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      
      render(
        <SlicerPanel
          enabled={true}
          offset={0}
          axis={2}
          expanded={true}
          onExpandToggle={onExpandToggle}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      expect(screen.getByText('Slicer Controls')).toBeInTheDocument();
      
      const buttons = screen.getAllByRole('button');
      // Axis buttons: X, Y, Z
      expect(buttons.length).toBe(3);
      fireEvent.click(buttons[0]!); // Click X axis
      expect(onUpdate).toHaveBeenCalledWith({ axis: 0 });
    });

    it('returns null when not enabled', () => {
      const onUpdate = vi.fn();
      const onExpandToggle = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      
      const { container } = render(
        <SlicerPanel
          enabled={false}
          offset={0}
          axis={2}
          expanded={true}
          onExpandToggle={onExpandToggle}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('handles offset slider changes', () => {
        const onUpdate = vi.fn();
        const onExpandToggle = vi.fn();
        const setIsDragging = vi.fn();
        const setDraggingParam = vi.fn();
        
        render(
          <SlicerPanel
            enabled={true}
            offset={0}
            axis={2}
            expanded={true}
            onExpandToggle={onExpandToggle}
            onUpdate={onUpdate}
            isDragging={false}
            draggingParam={null}
            setIsDragging={setIsDragging}
            setDraggingParam={setDraggingParam}
          />
        );
  
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBeGreaterThan(0);
        fireEvent.change(sliders[0]!, { target: { value: '1.5' } });
        expect(onUpdate).toHaveBeenCalledWith({ offset: 1.5 });
    });

    it('handles dragging events on slicer slider', () => {
      const onUpdate = vi.fn();
      const onExpandToggle = vi.fn();
      const setIsDragging = vi.fn();
      const setDraggingParam = vi.fn();
      
      render(
        <SlicerPanel
          enabled={true}
          offset={0}
          axis={2}
          expanded={true}
          onExpandToggle={onExpandToggle}
          onUpdate={onUpdate}
          isDragging={false}
          draggingParam={null}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      );

      const slider = screen.getAllByRole('slider')[0]!;
      
      fireEvent.mouseDown(slider);
      expect(setIsDragging).toHaveBeenCalledWith(true);
      expect(setDraggingParam).toHaveBeenCalledWith('slicer');
      
      fireEvent.mouseUp(slider);
      expect(setIsDragging).toHaveBeenCalledWith(false);
      expect(setDraggingParam).toHaveBeenCalledWith(null);

      fireEvent.touchStart(slider);
      expect(setIsDragging).toHaveBeenCalledWith(true);

      fireEvent.touchEnd(slider);
      expect(setIsDragging).toHaveBeenCalledWith(false);
    });
  });
});
