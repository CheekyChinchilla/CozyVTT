import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// Note: React.StrictMode is intentionally omitted here.
// StrictMode's double-invocation of effects causes WebSocket connections to be
// established and immediately torn down, making the campaign page unusable in dev.
// The WebSocketContext and socketClient are designed to handle connection lifecycle
// correctly without it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
