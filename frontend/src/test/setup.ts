import '@testing-library/jest-dom/vitest'
import { afterAll, beforeAll, vi } from 'vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
})

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect() {
    return {
      width: 960,
      height: 540,
      top: 0,
      left: 0,
      bottom: 540,
      right: 960,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
  },
})

const originalConsoleError = console.error

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const [first] = args
    if (typeof first === 'string' && first.includes('The width(-1) and height(-1) of chart should be greater than 0')) {
      return
    }
    originalConsoleError(...args)
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
