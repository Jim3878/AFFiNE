/**
 * nineday: a horizontal scrollbar that stays at the bottom of the viewport while a wide, tall
 * element (a table) is on screen, instead of only at the element's bottom edge.
 *
 * `bar` is an empty element rendered right after `frame` (the scroller itself, or the element
 * that wraps it), in the same parent. It sticks to the bottom of the nearest scrolling
 * ancestor, mirrors the scroller's scroll position both ways, and is hidden when there is
 * nothing to scroll. The scroller's own scrollbar is hidden so there is only one.
 */
export function bindStickyScrollbar(
  scroller: HTMLElement,
  bar: HTMLElement,
  frame: HTMLElement = scroller
): () => void {
  const inner = document.createElement('div');
  inner.style.height = '1px';
  bar.replaceChildren(inner);
  Object.assign(bar.style, {
    position: 'sticky',
    bottom: '0',
    zIndex: '2',
    height: '12px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--affine-black-30) transparent',
  });
  scroller.style.scrollbarWidth = 'none';

  const update = () => {
    const frameStyle = getComputedStyle(frame);
    bar.style.marginLeft = frameStyle.marginLeft;
    bar.style.marginRight = frameStyle.marginRight;
    inner.style.width = `${scroller.scrollWidth}px`;
    const overflowing = scroller.scrollWidth > scroller.clientWidth + 1;
    bar.style.display = overflowing ? 'block' : 'none';
    if (overflowing && bar.scrollLeft !== scroller.scrollLeft) {
      bar.scrollLeft = scroller.scrollLeft;
    }
  };

  const onScrollerScroll = () => {
    if (bar.scrollLeft !== scroller.scrollLeft) {
      bar.scrollLeft = scroller.scrollLeft;
    }
  };
  const onBarScroll = () => {
    if (scroller.scrollLeft !== bar.scrollLeft) {
      scroller.scrollLeft = bar.scrollLeft;
    }
  };
  scroller.addEventListener('scroll', onScrollerScroll, { passive: true });
  bar.addEventListener('scroll', onBarScroll, { passive: true });

  // The content's width changes with columns; the scroller's with the window. Update in the
  // next frame: changing the layout inside the observer callback would loop it.
  let pendingFrame = 0;
  const scheduleUpdate = () => {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      update();
    });
  };
  const resizeObserver = new ResizeObserver(scheduleUpdate);
  const observeContent = () => {
    resizeObserver.disconnect();
    resizeObserver.observe(scroller);
    for (const child of Array.from(scroller.children)) {
      resizeObserver.observe(child);
    }
  };
  const mutationObserver = new MutationObserver(observeContent);
  mutationObserver.observe(scroller, { childList: true });
  observeContent();
  update();

  return () => {
    cancelAnimationFrame(pendingFrame);
    scroller.removeEventListener('scroll', onScrollerScroll);
    bar.removeEventListener('scroll', onBarScroll);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    scroller.style.scrollbarWidth = '';
    bar.style.display = 'none';
  };
}
