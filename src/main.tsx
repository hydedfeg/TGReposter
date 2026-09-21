import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import MarketingHome from './MarketingHome.tsx';
import PromotionPage from './PromotionPage.tsx';
import './index.css';

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const hostname = window.location.hostname.toLowerCase();
  const isLocalDashboard = ['localhost', '127.0.0.1', 'terminal.local'].includes(hostname)
    && window.location.pathname.startsWith('/dashboard');
  const isDashboardHost = hostname === 'api.tgreposter.com' || isLocalDashboard;

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!isDashboardHost) return <MarketingHome />;
  return hash === '#promotion' ? <PromotionPage /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
