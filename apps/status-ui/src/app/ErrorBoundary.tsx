import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface State {
  error: Error | null;
}

/**
 * Route-level boundary. A render failure must still leave the shell, the banner and a way back —
 * an empty outlet is the one failure the spec forbids.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // No telemetry, no third-party request: the error stays in this tab.
    console.error("route render failed:", error.message);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="my-8 border-l-2 border-red py-2 pl-4">
          <h1 className="text-lg">This route failed to render</h1>
          <p className="mt-2 text-sm text-paper-dim">
            The evidence layer and the banner are still here. {this.state.error.message}
          </p>
          <p className="mt-3 text-sm">
            <Link to="/" className="link-quiet">
              Back to the Overview
            </Link>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
