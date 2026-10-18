import { cn } from './cn';

// Class recipes shared by the UI components. Kept out of the .jsx files so
// those export components only (React Fast Refresh requirement).

const BUTTON_VARIANTS = {
    primary: 'bg-accent text-accent-fg shadow-card hover:bg-accent-hover',
    secondary: 'bg-surface text-fg border border-border shadow-card hover:bg-surface-2',
    ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
    danger: 'bg-danger text-white shadow-card hover:opacity-90',
    'danger-ghost': 'text-danger hover:bg-danger-soft',
};

// Every size meets the 44px touch-target minimum except `sm`, which is for
// dense desktop tables only
const BUTTON_SIZES = {
    sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
    md: 'h-11 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-5 text-base gap-2 rounded-xl',
    icon: 'size-11 rounded-xl',
};

export const buttonClasses = ({ variant = 'primary', size = 'md', className } = {}) => cn(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none cursor-pointer',
    'transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className
);

export const inputClasses = (invalid) => cn(
    'block w-full h-11 rounded-xl border bg-surface px-3.5 text-base text-fg placeholder:text-faint',
    'transition-colors duration-200 focus:outline-none focus-visible:outline-none focus:ring-4',
    invalid
        ? 'border-danger focus:ring-danger-soft'
        : 'border-border-strong focus:border-accent focus:ring-accent-soft'
);
