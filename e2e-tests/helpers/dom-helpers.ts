import { Locator } from "@playwright/test";

export const elementIsClipped = async (locator: Locator) =>
  locator.evaluate((el) => {
    const getClippingParent = (element: HTMLElement | SVGElement): HTMLElement | null => {
      if (!element || element === document.documentElement) {
        return null; // Default fallback to window if no clipping container exists
      }

      let parent = element.parentElement;

      while (parent && parent !== document.documentElement) {
        const style = window.getComputedStyle(parent);

        // Check if the parent restricts overflow in any direction
        const isClipped = /(hidden|scroll|auto)/.test(
          style.overflow + style.overflowY + style.overflowX,
        );

        if (isClipped) {
          return parent;
        }

        parent = parent.parentElement;
      }
      return null;
    };

    const rect = el.getBoundingClientRect();
    const parentEl = getClippingParent(el);
    if (!parentEl) {
      return false;
    }
    const parent = parentEl.getBoundingClientRect();
    return (
      parent.height === 0 ||
      rect.bottom < parent.top ||
      rect.top > parent.bottom ||
      rect.right < parent.left ||
      rect.left > parent.right
    );
  });
