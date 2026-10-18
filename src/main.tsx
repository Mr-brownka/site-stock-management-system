import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FeedbackHost } from './components/feedback';
import './styles.css';
import { bootStep } from './lib/boot';

bootStep('Checking your account…', 30, 55);
import { TrainingBar } from './components/Training';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <FeedbackHost />
    <TrainingBar />
  </StrictMode>,
);
