import React from 'react';
export class WorkspaceErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? (
      <section className="panel operations-jobs" role="alert">
        <h2>This section could not load</h2>
        <p>
          Your saved records remain available. Reload the page to load the latest version, or choose
          another section.
        </p>
        <button className="button secondary" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
