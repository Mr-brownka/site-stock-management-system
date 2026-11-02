import { useEffect, useState } from 'react';
import { watchForNewVersion } from '../lib/errorLog';

/** "New version · Refresh": shown when an update went live while the app was open. */
export function NewVersion() {
  const [on, setOn] = useState(false);
  useEffect(() => { watchForNewVersion(() => setOn(true)); }, []);
  if (!on) return null;
  return (
    <div className="newVer" role="status">
      <span>New version of Ostock</span>
      <button onClick={() => location.reload()}>Refresh</button>
    </div>
  );
}
