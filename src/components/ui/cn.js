import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names; later Tailwind classes override conflicting earlier ones. */
export const cn = (...inputs) => twMerge(clsx(inputs));
