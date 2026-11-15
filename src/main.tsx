import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The native app bundles its files, so it doesn't need the offline service worker
if (import.meta.env.PROD && !Capacitor.isNativePlatform()) registerSW({ immediate: true });
