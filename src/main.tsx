import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FeedbackHost } from './components/feedback';
import './styles.css';
import { bootStep } from './lib/boot';
import { installFx } from './lib/fxGlobal';
import { installBusyButtons } from './lib/busyButtons';
import { enterMovesOn, keepFocusClear } from './components/ui';

bootStep('Checking your account…', 30, 55);
installFx();
keepFocusClear();
enterMovesOn();
import { TrainingBar } from './components/Training';

installBusyButtons();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <FeedbackHost />
    <TrainingBar />
  </StrictMode>,
);
