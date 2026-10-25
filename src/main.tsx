import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startAutoSync } from './lib/sync';
import { startUsdaKeySync } from './lib/usdaKeySync';
import './styles.css';

registerSW({ immediate: true });
startAutoSync();
startUsdaKeySync();

// Ask the browser not to clear our offline data when space is low.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
