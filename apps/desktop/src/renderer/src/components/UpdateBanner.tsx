import { useEffect, useState } from 'react';
import type { UpdateState } from '../../../preload/index.d';

export function UpdateBanner(): React.JSX.Element | null {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    window.api.getUpdateState().then(setUpdate);
    return window.api.onUpdateState(setUpdate);
  }, []);

  if (update.status === 'idle' || update.status === 'checking') return null;

  if (update.status === 'available') {
    return (
      <div className="flex items-center justify-between pl-20 pr-3 py-1.5 bg-blue-600 text-white text-xs">
        <span>Update available: v{update.version}</span>
        <button
          onClick={() => window.api.downloadUpdate()}
          className="ml-4 underline hover:no-underline"
        >
          Download
        </button>
      </div>
    );
  }

  if (update.status === 'downloading') {
    return (
      <div className="flex items-center gap-3 pl-20 pr-3 py-1.5 bg-blue-600 text-white text-xs">
        <span>Downloading update…</span>
        <div className="flex-1 bg-blue-400 rounded-full h-1.5 max-w-32">
          <div
            className="bg-white rounded-full h-1.5 transition-all"
            style={{ width: `${update.progress ?? 0}%` }}
          />
        </div>
        <span>{update.progress ?? 0}%</span>
      </div>
    );
  }

  if (update.status === 'ready') {
    return (
      <div className="flex items-center justify-between pl-20 pr-3 py-1.5 bg-green-600 text-white text-xs">
        <span>v{update.version} ready to install</span>
        <button
          onClick={() => window.api.installUpdate()}
          className="ml-4 underline hover:no-underline"
        >
          Restart & update
        </button>
      </div>
    );
  }

  if (update.status === 'error') {
    return (
      <div className="flex items-center justify-between pl-20 pr-3 py-1.5 bg-yellow-600 text-white text-xs">
        <span>
          Update check failed —{' '}
          <a
            onClick={() => window.api.openReleasesPage()}
            className="underline cursor-pointer hover:no-underline"
          >
            view releases
          </a>
        </span>
        <button
          onClick={() => window.api.checkForUpdate()}
          className="ml-4 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
