import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/context/AuthContext';
import { ConsignmentModal } from '../src/components/ConsignmentModal';
import '../src/index.css';

// Served only by the guarded synthetic harness; Firebase imports are emulator-bound.
createRoot(document.getElementById('root')!).render(<AuthProvider>
  <ConsignmentModal isOpen onClose={() => { location.href = '/catalog?actor=public'; }} />
</AuthProvider>);
