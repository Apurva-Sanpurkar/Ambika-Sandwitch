import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import POSDashboard from './features/pos/POSDashboard';
import KitchenDisplay from './features/kitchen/KitchenDisplay';
import AdminPanel from './features/admin/AdminPanel';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<POSDashboard />} />
        <Route path="/kitchen" element={<KitchenDisplay />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;