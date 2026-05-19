import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

// Mock ResizeObserver for jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

const noop = () => () => {};

// Mock window.contexture (Electron preload bridge)
Object.defineProperty(window, 'contexture', {
  value: {
    update: {
      check: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn(),
      openReleasesPage: vi.fn(),
      getState: vi.fn().mockResolvedValue({ status: 'idle' }),
      onState: vi.fn(noop),
    },
  },
  writable: true,
});
