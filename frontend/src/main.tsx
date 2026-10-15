import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import AppRouter from './AppRouter.tsx';
import './assets/fonts/fonts.css';
import './index.css';

// Note: React.StrictMode is intentionally omitted here.
// StrictMode's double-invocation of effects causes WebSocket connections to be
// established and immediately torn down, making the campaign page unusable in dev.
// The WebSocketContext and socketClient are designed to handle connection lifecycle
// correctly without it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppRouter>
    <App />
  </AppRouter>
);
