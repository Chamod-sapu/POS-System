import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './app/App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
