import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { SellerDraftWorkspace } from '../src/components/SellerDraftWorkspace';

const root = createRoot(document.getElementById('root')!);
async function start() {
  const response = await fetch('/fixture', { redirect: 'error' });
  if (!response.ok) throw new Error('Synthetic fixture unavailable.');
  const fixture = await response.json();
  if (location.hostname !== '127.0.0.1' || fixture.projectId !== 'demo-wailtail-stage3' ||
      fixture.authHost !== '127.0.0.1:9099') throw new Error('Unexpected emulator target.');
  const app = initializeApp({ projectId: fixture.projectId, apiKey: 'fake-key' });
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  const { user } = await signInWithEmailAndPassword(auth, fixture.email, fixture.password);
  root.render(<SellerDraftWorkspace auctionId={fixture.auctionId} user={user}
    onBack={() => root.render(<p>Returned from workspace.</p>)} />);
}
void start().catch((err: unknown) => root.render(<p role="alert">{String(err)}</p>));
