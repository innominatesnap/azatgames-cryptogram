import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensurePlayLocation } from './play/routes';
import { App } from './ui/App';
import './ui/app.css';

ensurePlayLocation(window.location);

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    void navigator.serviceWorker.register('/play/sw.js').catch(function () {
      return undefined;
    });
  });
}
