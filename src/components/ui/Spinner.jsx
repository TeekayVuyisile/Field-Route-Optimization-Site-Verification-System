import { LuLoaderCircle } from 'react-icons/lu';
import { cn } from './cn';

const Spinner = ({ className, label = 'Loading' }) => (
    <LuLoaderCircle className={cn('size-4 animate-spin', className)} role="status" aria-label={label} />
);

export default Spinner;
