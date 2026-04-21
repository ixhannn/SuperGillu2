import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';

const rootElement = document.getElementById('admin-root');
if (!rootElement) {
  throw new Error('Could not find admin root element.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
