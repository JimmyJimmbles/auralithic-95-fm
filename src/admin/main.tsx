import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp.tsx';
import '../styles/windows95.css';
import '../styles/admin.css';
import '../styles/mount.css';

document.body.classList.add('admin-page');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
