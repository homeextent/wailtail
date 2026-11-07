import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './full-app-firebase';

async function start() {
  const query = new URLSearchParams(location.search);
  if (query.get('actor') === 'public') {
    await import('../src/main');
    return;
  }
  const admin = query.get('actor') === 'admin' || location.pathname === '/admin';
  const response = await fetch(admin ? '/admin-fixture' : '/fixture', { redirect: 'error' });
  if (!response.ok) throw new Error('Synthetic fixture unavailable.');
  const fixture = await response.json();
  if (fixture.projectId !== 'demo-wailtail-stage3' || fixture.authHost !== '127.0.0.1:9099') {
    throw new Error('Unexpected emulator target.');
  }
  await signInWithEmailAndPassword(auth, fixture.email, fixture.password);
  if (query.get('fixture') === 'draft') {
    history.replaceState({}, '', `/dashboard/listings/${fixture.auctionId}/edit`);
  }
  await import('../src/main');
}
void start().catch((err: unknown) => {
  const root = document.getElementById('root');
  if (root) root.textContent = String(err);
});
