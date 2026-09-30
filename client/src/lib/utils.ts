import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes, letting the caller's win.
 *
 * `clsx` flattens the conditional forms; `twMerge` resolves conflicts within a
 * utility group, so a component's default `px-4` yields to a `px-6` passed in
 * rather than both landing in `class` and the stylesheet order deciding.
 * shadcn-vue components expect this to exist at `@/lib/utils`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
