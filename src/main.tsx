import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import MarketingHome from './MarketingHome.tsx';
import PromotionPage from './PromotionPage.tsx';
import { isStagingRailwayHostname } from './utils/dashboardLink';
import './i18n';
import './index.css';

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const hostname = window.location.hostname.toLowerCase();
  const dashboardPathRequested = window.location.pathname.startsWith('/dashboard');
  const isLocalDashboard = ['localhost', '127.0.0.1', 'terminal.local'].includes(hostname)
    && dashboardPathRequested;
  const isVercelPreviewDashboard = hostname.endsWith('.vercel.app')
    && dashboardPathRequested;
  const isStagingRailwayDashboard = isStagingRailwayHostname(hostname)
    && dashboardPathRequested;
  const isDashboardHost =
    hostname === 'api.tgreposter.com'
    || isLocalDashboard
    || isVercelPreviewDashboard
    || isStagingRailwayDashboard;

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = isDashboardHost ? '#f8fafc' : '#061725';
    }
  }, [isDashboardHost]);

  if (!isDashboardHost) return <MarketingHome />;
  return hash === '#promotion' ? <PromotionPage /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
