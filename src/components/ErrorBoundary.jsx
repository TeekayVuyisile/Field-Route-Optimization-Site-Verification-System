import { Component } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';
import Button from './ui/Button';
import { buttonClasses } from './ui/classes';

/**
 * Catches render errors in a page so one crash shows a recovery screen
 * instead of a blank white app. `resetKey` (the current path) clears the
 * error when the user navigates elsewhere.
 */
class ErrorBoundary extends Component {
    state = { error: null, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error) {
        return { error };
    }

    static getDerivedStateFromProps(props, state) {
        if (props.resetKey !== state.resetKey) {
            return { error: null, resetKey: props.resetKey };
        }
        return null;
    }

    componentDidCatch(error, info) {
        console.error('Page crashed:', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center" role="alert">
                <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
                    <LuTriangleAlert className="size-6" aria-hidden />
                </span>
                <h1 className="mt-4 text-xl font-bold">Something went wrong</h1>
                <p className="mt-1 text-muted">Your saved trips are safe. Try again, or head back to your trips.</p>
                <div className="mt-6 flex gap-2">
                    <Button onClick={() => this.setState({ error: null })}>Try again</Button>
                    {/* A full page load, in case the app state itself is what broke */}
                    <a href="/dashboard" className={buttonClasses({ variant: 'secondary' })}>Your trips</a>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
