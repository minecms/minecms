import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import './styles/index.css';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Не найден корневой контейнер #app в index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
