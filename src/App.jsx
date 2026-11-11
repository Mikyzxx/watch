import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PairingPortal } from './components/PairingPortal.jsx';
import { DualDemoView } from './components/DualDemoView.jsx';
import { PhoneTerminal } from './components/PhoneTerminal.jsx';
import { SmartwatchApp } from './components/SmartwatchApp.jsx';

function parseLocation() {
  const path = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search);
  const room = (params.get('room') || 'WALLST')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12) || 'WALLST';
  return { path, room };
}

export default function App() {
  const [route, setRoute] = useState(parseLocation);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((nextPath, nextRoom) => {
    const safeRoom = (nextRoom || route.room || 'WALLST')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 12) || 'WALLST';
    const targetUrl = `${nextPath}?room=${encodeURIComponent(safeRoom)}`;
    window.history.pushState({}, '', targetUrl);
    setRoute({ path: nextPath, room: safeRoom });
  }, [route.room]);

  const handleRoomChange = useCallback((newRoom) => {
    const safeRoom = (newRoom || 'WALLST')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 12);
    const url = `${route.path}?room=${encodeURIComponent(safeRoom || 'WALLST')}`;
    window.history.replaceState({}, '', url);
    setRoute((prev) => ({ ...prev, room: safeRoom || 'WALLST' }));
  }, [route.path]);

  if (route.path === '/demo') {
    return <DualDemoView roomId={route.room} onNavigate={navigate} />;
  }

  if (route.path === '/phone') {
    return (
      <div className="standalone-container">
        <div className="standalone-nav">
          <button type="button" className="mini-back-btn" onClick={() => navigate('/', route.room)}>
            <ArrowLeft size={14} /> Inicio
          </button>
          <button type="button" className="mini-back-btn" onClick={() => navigate('/demo', route.room)}>
            Vista Dual
          </button>
        </div>
        <PhoneTerminal roomId={route.room} />
      </div>
    );
  }

  if (route.path === '/watch') {
    return (
      <div className="standalone-watch-container">
        <div className="standalone-nav">
          <button type="button" className="mini-back-btn" onClick={() => navigate('/', route.room)}>
            <ArrowLeft size={14} /> Inicio
          </button>
          <button type="button" className="mini-back-btn" onClick={() => navigate('/demo', route.room)}>
            Vista Dual
          </button>
        </div>
        <SmartwatchApp roomId={route.room} />
      </div>
    );
  }

  return (
    <PairingPortal
      roomId={route.room}
      onRoomChange={handleRoomChange}
      onNavigate={navigate}
    />
  );
}

