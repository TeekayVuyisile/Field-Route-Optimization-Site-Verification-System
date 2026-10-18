import { useId } from 'react';
import { LuCamera, LuCircleCheck } from 'react-icons/lu';
import { Input } from '../ui/Field';
import { cn } from '../ui/cn';
import { checklistProgress, isAnswered } from '../../features/checklists/checklist';
import { countLabel } from '../../lib/format';

const Required = () => <span className="ml-1 text-xs font-semibold text-danger">Required</span>;

const ChecklistItem = ({ item, value, photoCount, onAnswer }) => {
    const id = useId();
    const done = isAnswered(item, value, photoCount);

    if (item.type === 'check') {
        return (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => onAnswer(item.id, e.target.checked)}
                    className="size-5 shrink-0 accent-[var(--ro-accent)]"
                />
                <span className="text-sm">{item.label}{item.required && <Required />}</span>
            </label>
        );
    }

    if (item.type === 'photo') {
        return (
            <p className="flex min-h-11 items-center gap-3 py-1 text-sm">
                {done
                    ? <LuCircleCheck className="size-5 shrink-0 text-success" aria-hidden />
                    : <LuCamera className="size-5 shrink-0 text-faint" aria-hidden />}
                <span>
                    {item.label}{item.required && <Required />}
                    <span className="block text-faint">{done ? `${countLabel(photoCount, 'photo')} taken` : 'Use the Photo button above'}</span>
                </span>
            </p>
        );
    }

    return (
        <div className="space-y-1.5 py-1">
            <label htmlFor={id} className="block text-sm">{item.label}{item.required && <Required />}</label>
            {item.type === 'number' ? (
                <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={typeof value === 'number' ? value : ''}
                    onChange={(e) => onAnswer(item.id, e.target.value === '' ? null : Number(e.target.value))}
                />
            ) : (
                <Input id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onAnswer(item.id, e.target.value)} maxLength={500} />
            )}
        </div>
    );
};

/**
 * The trip's checklist for one stop. Answers save as they're given (through
 * the offline outbox), so nothing is lost if the agent leaves mid-way.
 */
const ChecklistForm = ({ checklist, answers, photoCount, onAnswer }) => {
    const { done, total } = checklistProgress(checklist, answers, photoCount);

    return (
        <section aria-label={`Checklist: ${checklist.name}`} className="rounded-xl border border-border p-3">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{checklist.name}</h3>
                <span className={cn('text-sm font-semibold tabular-nums', done === total ? 'text-success' : 'text-faint')}>
                    {done} of {total} done
                </span>
            </div>
            <div className="mt-1 divide-y divide-border">
                {checklist.items.map((item) => (
                    <ChecklistItem key={item.id} item={item} value={answers?.[item.id]} photoCount={photoCount} onAnswer={onAnswer} />
                ))}
            </div>
        </section>
    );
};

export default ChecklistForm;
