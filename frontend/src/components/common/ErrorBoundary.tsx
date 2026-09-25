import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { Button } from '../ui';

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
        <div className="p-8 my-6 max-w-3xl mx-auto rounded-2xl bg-[#161b22] border border-[#f85149]/40 shadow-2xl text-center space-y-4 animate-in fade-in">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#f85149]/15 border border-[#f85149]/30 text-[#f85149] flex items-center justify-center">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {this.props.fallbackTitle || 'Đã Xảy Ra Lỗi Hiển Thị (View Render Error)'}
            </h2>
            <p className="text-xs text-[#8b949e] mt-1 max-w-md mx-auto">
              {this.state.error?.message || 'Một sự cố không mong muốn đã xảy ra khi tải giao diện này.'}
            </p>
          </div>

          {this.state.error && (
            <div className="text-left bg-[#0d0e12] border border-[#30363d] p-3 rounded-xl max-h-36 overflow-y-auto font-mono text-[11px] text-[#f85149]/90">
              {this.state.error.stack || this.state.error.message}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={this.handleReload}
              className="text-xs border-[#30363d] text-white hover:border-[#58a6ff]"
            >
              Tải Lại Giao Diện
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
              Trang Chủ
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
