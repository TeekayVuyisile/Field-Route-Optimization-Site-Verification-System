import { Component } from 'react';
import { Container, Button } from 'react-bootstrap';

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
            <Container className="text-center mt-5" role="alert">
                <h3>Something went wrong</h3>
                <p className="text-muted">
                    Your saved trips are safe. Try again, or head back to the dashboard.
                </p>
                <div className="d-flex gap-2 justify-content-center">
                    <Button onClick={() => this.setState({ error: null })}>Try again</Button>
                    <Button variant="outline-secondary" href="/dashboard">Dashboard</Button>
                </div>
            </Container>
        );
    }
}

export default ErrorBoundary;
