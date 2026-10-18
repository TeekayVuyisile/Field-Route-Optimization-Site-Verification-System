import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import { cn } from './cn';

export const Card = ({ className, as: Tag = 'div', ...props }) => (
    <Tag className={cn('rounded-2xl border border-border bg-surface shadow-card', className)} {...props} />
);

const BADGE_TONES = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
};

export const Badge = ({ tone = 'neutral', className, ...props }) => (
    <span
        className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE_TONES[tone], className)}
        {...props}
    />
);

const ALERT_TONES = {
    info: { classes: 'border-accent/25 bg-accent-soft text-fg', icon: LuInfo, iconClass: 'text-accent' },
    success: { classes: 'border-success/25 bg-success-soft text-fg', icon: LuCircleCheck, iconClass: 'text-success' },
    warning: { classes: 'border-warning/25 bg-warning-soft text-fg', icon: LuTriangleAlert, iconClass: 'text-warning' },
    danger: { classes: 'border-danger/25 bg-danger-soft text-fg', icon: LuCircleAlert, iconClass: 'text-danger' },
};

export const Alert = ({ tone = 'info', title, children, action, className }) => {
    const { classes, icon: Icon, iconClass } = ALERT_TONES[tone];
    return (
        <div
            role={tone === 'danger' ? 'alert' : 'status'}
            className={cn('flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center', classes, className)}
        >
            <div className="flex flex-1 gap-3">
                <Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} aria-hidden />
                <div className="space-y-0.5">
                    {title && <p className="font-semibold">{title}</p>}
                    {children && <div className="text-muted">{children}</div>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
};

export const Skeleton = ({ className }) => (
    <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} aria-hidden />
);

export const EmptyState = ({ icon: Icon, title, children, action, className }) => (
    <div className={cn('flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center', className)}>
        {Icon && (
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Icon className="size-6" aria-hidden />
            </span>
        )}
        <h2 className="text-lg font-bold tracking-tight text-fg">{title}</h2>
        {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

export const PageHeader = ({ title, description, actions, className }) => (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
        <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-balance text-fg sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
);
