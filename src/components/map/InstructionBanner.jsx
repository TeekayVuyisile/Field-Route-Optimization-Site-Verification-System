import {
    LuArrowUp, LuArrowUpLeft, LuArrowUpRight, LuChevronLeft, LuChevronRight, LuCornerUpLeft,
    LuCornerUpRight, LuFlag, LuNavigation, LuRotateCw, LuUndo2
} from 'react-icons/lu';
import { formatDistance } from '../../lib/format';
import { cn } from '../ui/cn';

// ORS instruction types (step.type): 0/1 left/right, 2/3 sharp, 4/5 slight,
// 6 straight, 7/8 roundabout, 9 U-turn, 10 arrive, 11 depart, 12/13 keep
const MANEUVER_ICONS = {
    0: LuCornerUpLeft, 1: LuCornerUpRight,
    2: LuCornerUpLeft, 3: LuCornerUpRight,
    4: LuArrowUpLeft, 5: LuArrowUpRight,
    6: LuArrowUp,
    7: LuRotateCw, 8: LuRotateCw,
    9: LuUndo2,
    10: LuFlag,
    11: LuNavigation,
    12: LuArrowUpLeft, 13: LuArrowUpRight,
};

const stepButton = 'grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30';

/**
 * Turn-by-turn instruction, readable at a glance from a phone mount. The
 * guidance engine advances it; the arrows are a manual override.
 */
const InstructionBanner = ({ step, index, total, onPrevious, onNext, className }) => {
    const Icon = MANEUVER_ICONS[step.type] ?? LuArrowUp;

    return (
        <div
            className={cn('flex items-center gap-3 rounded-2xl bg-ink p-3 text-white shadow-overlay', className)}
            role="status"
            aria-live="polite"
        >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent">
                <Icon className="size-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-lg leading-snug font-bold sm:text-xl">{step.instruction}</p>
                <p className="text-sm text-white/70">
                    {formatDistance(step.distance)} · step {index + 1} of {total}
                </p>
            </div>
            <div className="flex shrink-0">
                <button type="button" className={stepButton} onClick={onPrevious} disabled={index === 0} aria-label="Previous instruction">
                    <LuChevronLeft className="size-5" />
                </button>
                <button type="button" className={stepButton} onClick={onNext} disabled={index >= total - 1} aria-label="Next instruction">
                    <LuChevronRight className="size-5" />
                </button>
            </div>
        </div>
    );
};

export default InstructionBanner;
