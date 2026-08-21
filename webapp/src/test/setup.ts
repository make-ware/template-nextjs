import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';
import React from 'react';
import { RUNTIME_CONFIG_KEY } from '@/lib/runtime-config';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock environment variables
process.env.NEXT_PUBLIC_POCKETBASE_URL = 'http://localhost:8090';

// The server-injected runtime config lives on `globalThis` (see
// lib/runtime-config.ts), which outlives module resets — clear it before every
// test so it cannot leak between suites.
beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RUNTIME_CONFIG_KEY];
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    return React.createElement('img', props);
  },
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => {
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Mock sonner (toast library)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
