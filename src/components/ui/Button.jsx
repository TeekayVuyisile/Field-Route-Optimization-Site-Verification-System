import { Link } from 'react-router-dom';
import { buttonClasses } from './classes';
import Spinner from './Spinner';

/**
 * @param {'primary'|'secondary'|'ghost'|'danger'|'danger-ghost'} props.variant
 * @param {'sm'|'md'|'lg'|'icon'} props.size
 * @param {boolean} props.loading  shows a spinner and disables the button
 * @param {string} props.to  renders a router Link styled as a button
 */
const Button = ({ variant, size, loading = false, disabled, className, children, to, type = 'button', ...props }) => {
    const classes = buttonClasses({ variant, size, className });

    if (to) {
        return <Link to={to} className={classes} {...props}>{children}</Link>;
    }

    return (
        <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
            {loading && <Spinner />}
            {children}
        </button>
    );
};

export default Button;
