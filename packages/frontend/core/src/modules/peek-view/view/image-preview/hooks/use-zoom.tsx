import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

interface UseZoomControlsProps {
  imageRef: RefObject<HTMLImageElement | null>;
}

interface Point {
  x: number;
  y: number;
}

// nineday: wheel zoom goes up to 500% and follows the pointer, the image can
// be dragged at any scale, and a click that did not drag is reported so the
// caller can close the preview.
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const BUTTON_STEP = 0.1;
// one mouse wheel notch (deltaY 100) is about 16%
const WHEEL_SENSITIVITY = 0.0015;
const MAX_WHEEL_DELTA = 100;
// pointer travel, in px, below which a press still counts as a click
const CLICK_TOLERANCE = 4;

export const useZoomControls = ({ imageRef }: UseZoomControlsProps) => {
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [isZoomedBigger, setIsZoomedBigger] = useState<boolean>(false);

  const scaleRef = useRef(1);
  const posRef = useRef<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draggedRef = useRef(false);
  // where the image center was right after a pointer-anchored zoom
  const anchoredCenterRef = useRef<Point | null>(null);

  const checkZoomSize = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    setIsZoomedBigger(
      image.naturalWidth * scaleRef.current > window.innerWidth ||
        image.naturalHeight * scaleRef.current > window.innerHeight
    );
  }, [imageRef]);

  const applyPosition = useCallback(
    (pos: Point) => {
      const image = imageRef.current;
      if (!image) return;
      posRef.current = pos;
      image.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    },
    [imageRef]
  );

  const applyScale = useCallback(
    (scale: number, pos: Point) => {
      const image = imageRef.current;
      if (!image) return;
      scaleRef.current = scale;
      image.style.width = `${image.naturalWidth * scale}px`;
      image.style.height = `${image.naturalHeight * scale}px`;
      applyPosition(pos);
      setCurrentScale(scale);
      checkZoomSize();
    },
    [imageRef, applyPosition, checkZoomSize]
  );

  /**
   * @param anchor viewport point that should stay where it is. Without it the
   * image is scaled around its own center.
   */
  const zoomTo = useCallback(
    (target: number, anchor?: Point) => {
      const image = imageRef.current;
      if (!image) return;

      const prev = scaleRef.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      // "fit to screen" can leave the scale outside the range, never clamp
      // against the direction the user asked for
      if (target > prev ? next <= prev : next >= prev) return;

      let pos = posRef.current;
      if (anchor) {
        const rect = image.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const ratio = next / prev;
        pos = {
          x: pos.x + (anchor.x - centerX) * (1 - ratio),
          y: pos.y + (anchor.y - centerY) * (1 - ratio),
        };
      }
      applyScale(next, pos);

      if (anchor) {
        const rect = image.getBoundingClientRect();
        anchoredCenterRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    },
    [imageRef, applyScale]
  );

  // Crossing the window size moves the caption out of the centered column,
  // which shifts the image. Put it back so the point under the pointer stays.
  useLayoutEffect(() => {
    const image = imageRef.current;
    const center = anchoredCenterRef.current;
    anchoredCenterRef.current = null;
    if (!image || !center) return;

    const rect = image.getBoundingClientRect();
    const dx = center.x - (rect.left + rect.width / 2);
    const dy = center.y - (rect.top + rect.height / 2);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      applyPosition({ x: posRef.current.x + dx, y: posRef.current.y + dy });
    }
  }, [currentScale, isZoomedBigger, imageRef, applyPosition]);

  const zoomIn = useCallback(() => {
    zoomTo(scaleRef.current + BUTTON_STEP);
  }, [zoomTo]);

  const zoomOut = useCallback(() => {
    zoomTo(scaleRef.current - BUTTON_STEP);
  }, [zoomTo]);

  const resetZoom = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    const margin = 0.2;
    const availableWidth = window.innerWidth * (1 - margin);
    const availableHeight = window.innerHeight * (1 - margin);
    const newScale = Math.min(
      availableWidth / image.naturalWidth,
      availableHeight / image.naturalHeight
    );
    applyScale(newScale, { x: 0, y: 0 });
  }, [imageRef, applyScale]);

  const resetScale = useCallback(() => {
    applyScale(1, { x: 0, y: 0 });
  }, [applyScale]);

  const handleDragStart = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    draggedRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
    };
  }, []);

  /**
   * Whether the click that just fired on the image was a plain click, not the
   * end of a drag.
   */
  const isPlainClick = useCallback(() => !draggedRef.current, []);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = Math.min(
        MAX_WHEEL_DELTA,
        Math.max(-MAX_WHEEL_DELTA, event.deltaY)
      );
      if (delta === 0) return;
      zoomTo(scaleRef.current * Math.exp(-delta * WHEEL_SENSITIVITY), {
        x: event.clientX,
        y: event.clientY,
      });
    };

    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!draggedRef.current) {
        if (Math.hypot(dx, dy) <= CLICK_TOLERANCE) return;
        draggedRef.current = true;
        if (imageRef.current) imageRef.current.style.cursor = 'grabbing';
      }
      event.preventDefault();
      applyPosition({ x: drag.originX + dx, y: drag.originY + dy });
    };

    const handleMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (imageRef.current) imageRef.current.style.cursor = 'grab';
    };

    checkZoomSize();

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', checkZoomSize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', checkZoomSize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [imageRef, zoomTo, applyPosition, checkZoomSize]);

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    resetScale,
    isZoomedBigger,
    currentScale,
    handleDragStart,
    isPlainClick,
  };
};
