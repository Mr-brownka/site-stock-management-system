import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FeedbackHost } from './components/feedback';
import './styles.css';
import { bootStep } from './lib/boot';
import { installFx } from './lib/fxGlobal';
import { installBusyButtons } from './lib/busyButtons';
import { enterMovesOn, keepFocusClear } from './components/ui';
import { AppGuard } from './components/Recover';
import { installErrorLog } from './lib/errorLog';
import { NewVersion } from './components/NewVersion';
import { installPwa } from './lib/pwa';

bootStep('Checking your account…', 30, 55);
installFx();
keepFocusClear();
enterMovesOn();
import { TrainingBar } from './components/Training';

installBusyButtons();
installPwa();
installErrorLog();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppGuard>
      <App />
      <FeedbackHost />
      <TrainingBar />
      <NewVersion />
    </AppGuard>
  </StrictMode>,
);
