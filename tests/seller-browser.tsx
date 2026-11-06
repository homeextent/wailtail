import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { requestAuctionReturnToDraft } from '../src/services/auctionReview';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { SellerDraftWorkspace } from '../src/components/SellerDraftWorkspace';

const root = createRoot(document.getElementById('root')!);
function AdminReview({ user, auctionId, revision, status }: {
  user: User; auctionId: string; revision: number; status: string;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function requestRevisions() {
    setBusy(true);
    setError('');
    try {
      await requestAuctionReturnToDraft(user, auctionId, revision, notes);
      setDone(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  return <main>
    <h1>Synthetic administrator review</h1>
    <p role="status">Listing status: {done ? 'draft' : status}</p>
    {error && <p role="alert">{error}</p>}
    <label>Revision notes <textarea value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <button type="button" disabled={busy || done || status !== 'pending_review'}
      onClick={() => void requestRevisions()}>Request Revisions</button>
  </main>;
}

async function start() {
  if (location.origin !== 'http://127.0.0.1:4178') throw new Error('Unexpected browser origin.');
  const admin = new URLSearchParams(location.search).get('mode') === 'admin';
  const response = await fetch(admin ? '/admin-fixture' : '/fixture', { redirect: 'error' });
  if (!response.ok) throw new Error('Synthetic fixture unavailable.');
  const fixture = await response.json();
  if (location.hostname !== '127.0.0.1' || fixture.projectId !== 'demo-wailtail-stage3' ||
      fixture.authHost !== '127.0.0.1:9099') throw new Error('Unexpected emulator target.');
  const app = initializeApp({ projectId: fixture.projectId, apiKey: 'fake-key' });
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  const { user } = await signInWithEmailAndPassword(auth, fixture.email, fixture.password);
  if (admin) {
    root.render(<AdminReview user={user} auctionId={fixture.auctionId}
      revision={fixture.revision} status={fixture.status} />);
    return;
  }
  root.render(<SellerDraftWorkspace auctionId={fixture.auctionId} user={user}
    onBack={() => root.render(<p>Returned from workspace.</p>)} />);
}
void start().catch((err: unknown) => root.render(<p role="alert">{String(err)}</p>));
