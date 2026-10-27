import { useData } from '../lib/store';
import { currentScreen, goBack } from '../lib/nav';
import { Icon } from './fx';

/** The same small "← Page" button above every page title: says where it goes, goes there. */
export function BackPill({ label, onClick }: { label?: string; onClick?: () => void }) {
  const { go } = useData();
  const cur = currentScreen();
  return (
    <button className="backPill" onClick={onClick ?? (() => goBack(go, cur))}>
      <Icon name="arrowL" size={16} />{label ?? 'Back'}
    </button>
  );
}
