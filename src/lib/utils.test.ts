/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn utility', () => {
  it('merges plain class strings', () => {
    expect(cn('flex', 'items-center', 'gap-2')).toBe('flex items-center gap-2');
  });

  it('filters conditional and falsy class values', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled', null, undefined)).toBe('base active');
  });

  it('resolves conflicting Tailwind utility classes via tailwind-merge', () => {
    expect(cn('px-2 py-1 text-sm', 'px-4 text-base')).toBe('py-1 px-4 text-base');
  });
});
