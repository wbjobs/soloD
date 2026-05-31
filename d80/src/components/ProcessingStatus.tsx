import React from 'react';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProcessingState } from '@/types/video';

interface ProcessingStatusProps {
  state: ProcessingState;
}

export function ProcessingStatus({ state }: ProcessingStatusProps) {
  if (!state.status && !state.error && state.progress === 0) {
    return null;
  }

  const getStatusIcon = () => {
    if (state.error) {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
    if (state.progress === 100 && !state.isLoading) {
      return <CheckCircle2 className="w-5 h-5 text-green-400" />;
    }
    return <Activity className={`w-5 h-5 text-cyan-400 ${state.isLoading ? 'animate-pulse' : ''}`} />;
  };

  const getStatusColor = () => {
    if (state.error) return 'text-red-400';
    if (state.progress === 100 && !state.isLoading) return 'text-green-400';
    return 'text-cyan-400';
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700">
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <p className={`font-medium ${getStatusColor()}`}>
            {state.error || state.status || '就绪'}
          </p>
          {state.isLoading && (
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}
        </div>
        {state.progress > 0 && state.isLoading && (
          <span className="text-slate-400 font-mono text-sm">
            {state.progress}%
          </span>
        )}
      </div>
    </div>
  );
}
