import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class names using clsx and merges them with tailwind-merge.
 * This is a standard utility for shadcn/ui components.
 * 
 * @param inputs - Class names or conditional class objects.
 * @returns A merged string of tailwind classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
