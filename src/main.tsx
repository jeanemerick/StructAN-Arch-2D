import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      onReset={() => {
        try {
          localStorage.removeItem('structan-arch-2d:modelo');
        } catch {
          /* armazenamento indisponível */
        }
      }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
