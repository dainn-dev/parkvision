import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { Button } from '../ui';
import i18n from '../../i18n';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 my-6 max-w-3xl mx-auto rounded-2xl bg-card border border-destructive/40 text-center space-y-4 animate-in fade-in">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center justify-center">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground tracking-tight">
              {this.props.fallbackTitle || i18n.t('Something went wrong (View Render Error)', { ns: 'common' })}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {this.state.error?.message || i18n.t('An unexpected error occurred while rendering this view.', { ns: 'common' })}
            </p>
          </div>

          {this.state.error && (
            <div className="text-left bg-background border border-border p-3 rounded-xl max-h-36 overflow-y-auto text-[11px] text-destructive/90">
              {this.state.error.stack || this.state.error.message}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={this.handleReload}
              className="text-xs border-border text-foreground hover:border-primary"
            >
              {i18n.t('Reload View', { ns: 'common' })}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Home}
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.href = '/';
              }}
              className="text-xs"
            >
              {i18n.t('Home', { ns: 'common' })}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
