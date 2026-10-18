import { useId } from 'react';
import { cn } from './cn';
import { inputClasses } from './classes';

/**
 * Label + control + hint/error, wired up for screen readers. Pass a single
 * input/select as the child function: ({ id, describedBy, invalid }) => <Input .../>
 */
export const Field = ({ label, hint, error, className, children }) => {
    const id = useId();
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
        <div className={cn('space-y-1.5', className)}>
            <label htmlFor={id} className="block text-sm font-semibold text-fg">{label}</label>
            {children({ id, describedBy, invalid: Boolean(error) })}
            {error && <p id={errorId} className="text-sm text-danger">{error}</p>}
            {hint && !error && <p id={hintId} className="text-sm text-faint">{hint}</p>}
        </div>
    );
};

export const Input = ({ invalid, className, describedBy, ...props }) => (
    <input
        className={cn(inputClasses(invalid), className)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...props}
    />
);

export const Select = ({ invalid, className, describedBy, children, ...props }) => (
    <select
        className={cn(inputClasses(invalid), 'pr-9 cursor-pointer', className)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...props}
    >
        {children}
    </select>
);
