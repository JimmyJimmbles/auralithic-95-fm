import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { parseLocation } from './hooks/useRoute.ts';
import './styles/windows95.css';
import './styles/radio95.css';
import './styles/mount.css';

document.body.classList.add('radio-app');
const initial = parseLocation();
document.body.classList.toggle('station-page', initial.view === 'station' || initial.view === 'radio');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
