import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Auction } from '../types';
import { DEALER_TAX_CHOICES } from '../config/dealerListing';

async function request(user: User, input: object) {
  const response = await fetch('/api/admin-dealer-listing', { method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Dealer listing action failed: ${data.error || response.status}. Reload current details before retrying; your entries are retained.`);
  return data;
}

function TaxChoice({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return <label className="block">Informational tax handling<select aria-label="Dealer tax handling" name="taxHandling" value={value} onChange={e => onChange(e.target.value)} className="block w-full rounded bg-slate-800 p-3">
    {DEALER_TAX_CHOICES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select><span className="text-sm">Record the confirmed arrangement. WAILTAIL calculates and collects no tax. Requires confirmation blocks public visibility.</span></label>;
}

export function DealerConversionPanel({ user, applicationId }: { user: User; applicationId: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [tax, setTax] = useState('requires_confirmation');
  const [reason, setReason] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const commands = useRef(new Map<string, string>());
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || message) { feedback.current?.focus({ preventScroll: true }); feedback.current?.scrollIntoView({ block: 'center' }); } }, [error, message]);
  async function reload() {
    setBusy(true); setError('');
    try { setDetail(await request(user, { action: 'read', applicationId })); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    request(user, { action: 'read', applicationId }).then(data => { if (!cancelled) setDetail(data); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user, applicationId]);
  async function convert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!detail || !approved || busy) return;
    const visible = new FormData(e.currentTarget);
    const payload = { action: 'convert', applicationId, expectedRevision: detail.revision,
      applicationFingerprint: detail.applicationFingerprint,
      taxHandling: tax, reason: String(visible.get('reason') || '') };
    const key = JSON.stringify(payload);
    if (!commands.current.has(key)) commands.current.set(key, crypto.randomUUID());
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request(user, { ...payload, commandId: commands.current.get(key) });
      commands.current.delete(key); setDetail({ ...detail, applicationStatus: 'approved', convertedAuctionId: result.auctionId });
      setMessage('Dealer draft created. Vehicle application approved; account roles are unchanged.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return <section aria-label="Dealer vehicle conversion" className="space-y-3 rounded border border-emerald-800 p-4">
    <h3 className="font-bold text-lg">Approve dealer vehicle and create draft</h3>
    <p>Separate from business verification: this explicitly approves this vehicle application. Only canonical dealer applications are supported. No lot is published and no seller role is granted.</p>
    <div ref={feedback} tabIndex={-1}>{error && <p role="alert" className="text-red-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}</div>
    <button type="button" disabled={busy} onClick={reload} className="underline">Reload dealer conversion eligibility</button>
    {detail && <><p>Vehicle: {detail.vehicleTitle}</p><p>Application: {detail.applicationStatus} · Dealer eligible: {detail.eligible ? 'Yes' : 'No — verify or renew before conversion'}</p>
      {detail.dealer && <p>Business: {detail.dealer.displayName} · {detail.dealer.city}, {detail.dealer.province} · Representative UID: {detail.representativeUid} · Documentation fee: CAD $0</p>}
      {detail.convertedAuctionId ? <a className="underline" href={`/dashboard/listings/${encodeURIComponent(detail.convertedAuctionId)}/edit`}>Open converted dealer draft</a> :
        <form onSubmit={convert} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
          <TaxChoice value={tax} onChange={setTax} />
          <label className="block">Vehicle approval reason *<textarea name="reason" aria-label="Dealer vehicle approval reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} className="block bg-slate-800 p-3 w-full" /></label>
          <label className="block"><input aria-label="Confirm dealer vehicle approval" type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> I have reviewed this vehicle and approve creating its assigned dealer draft.</label>
          <button type="submit" disabled={!approved || !detail.eligible || !['pending', 'reviewed', 'approved'].includes(detail.applicationStatus)} className="rounded bg-emerald-800 p-3 disabled:opacity-50">Approve vehicle and create dealer draft</button>
        </fieldset></form>}
    </>}
  </section>;
}

export function DealerAttributionPanel({ auction, user }: { auction: Auction; user: User; key?: string }) {
  const [tax, setTax] = useState(auction.taxHandling || 'requires_confirmation');
  const [revision, setRevision] = useState(auction.dealerListingRevision ?? 0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const commands = useRef(new Map<string, string>());
  useEffect(() => { setTax(auction.taxHandling || 'requires_confirmation'); setRevision(auction.dealerListingRevision ?? 0); }, [auction.id, auction.taxHandling, auction.dealerListingRevision]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = { action: 'update_tax', auctionId: auction.id, expectedRevision: revision, taxHandling: tax, reason };
    const key = JSON.stringify(payload);
    if (!commands.current.has(key)) commands.current.set(key, crypto.randomUUID());
    setBusy(true); setMessage('');
    try { const result = await request(user, { ...payload, commandId: commands.current.get(key) });
      setRevision(result.dealerListingRevision);
      commands.current.delete(key); setMessage('Dealer tax indicator saved. Snapshot and ownership are unchanged.');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section aria-label="Protected dealer attribution" className="rounded border border-emerald-800 p-4 m-4 space-y-3">
    <h2 className="font-bold text-lg">Protected dealer attribution</h2>
    <p>{auction.dealerSnapshot?.displayName || auction.dealerSnapshot?.dealershipName} · {auction.dealerSnapshot?.city}, {auction.dealerSnapshot?.province}</p>
    <p>Dealer ID: {auction.dealerId} · Assigned representative: {auction.sellerId} · Documentation fee: CAD $0</p>
    <p>Snapshot and representative assignment are fixed. Profile updates do not rewrite this listing's historical attribution. New vehicle inventory requires a separately reviewed application.</p>
    {message && <p role="status">{message}</p>}
    {auction.status === 'draft' ? <form onSubmit={save}><fieldset disabled={busy} className="space-y-3">
      <TaxChoice value={tax} onChange={setTax} />
      <label>Tax indicator change reason *<textarea aria-label="Dealer tax change reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} className="block w-full bg-slate-800 p-3" /></label>
      <button type="submit" className="rounded bg-emerald-800 p-3">Save dealer tax indicator</button>
    </fieldset></form> : <p>Tax indicator: {tax}. Changes are restricted to drafts.</p>}
  </section>;
}
