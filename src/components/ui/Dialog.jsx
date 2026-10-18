import * as RadixDialog from '@radix-ui/react-dialog';
import { LuX } from 'react-icons/lu';
import { cn } from './cn';
import Button from './Button';

/**
 * Accessible modal (focus trap, Escape to close, scroll lock) via Radix.
 * On phones it docks to the bottom like a sheet; on wider screens it centres.
 */
export const Dialog = ({ open, onOpenChange, title, description, children, footer, className }) => (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        <RadixDialog.Portal>
            <RadixDialog.Overlay className="ui fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
            <RadixDialog.Content
                className={cn(
                    'ui fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-overlay',
                    'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6',
                    'data-[state=open]:animate-fade-in focus:outline-none',
                    className
                )}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <RadixDialog.Title className="text-lg font-bold tracking-tight text-fg">{title}</RadixDialog.Title>
                        {description && (
                            <RadixDialog.Description className="text-sm text-muted">{description}</RadixDialog.Description>
                        )}
                    </div>
                    <RadixDialog.Close asChild>
                        <Button variant="ghost" size="icon" className="-mt-2 -mr-2" aria-label="Close">
                            <LuX className="size-5" />
                        </Button>
                    </RadixDialog.Close>
                </div>
                {children}
                {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
            </RadixDialog.Content>
        </RadixDialog.Portal>
    </RadixDialog.Root>
);

/** Replacement for window.confirm, which blocks the page and can't be styled. */
export const ConfirmDialog = ({
    open, onOpenChange, title, description, confirmLabel = 'Confirm', tone = 'danger', loading = false, onConfirm
}) => (
    <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        footer={(
            <>
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
                    {confirmLabel}
                </Button>
            </>
        )}
    />
);
