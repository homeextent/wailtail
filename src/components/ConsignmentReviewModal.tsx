import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { ConsignmentApplication } from '../types';
import { DESIGNATED_ADMIN_EMAILS } from '../config/adminConfig';
import { consignmentReviewRequest, type ConsignmentReviewDetail } from '../services/consignmentReview';
import { formatDateTime } from '../utils/formatters';

const fields = [
  ['year', 'Year'], ['make', 'Make'], ['model', 'Model'], ['generation', 'Generation / chassis'],
  ['vin', 'VIN'], ['mileage', 'Odometer'], ['transmission', 'Transmission'],
  ['sellerName', 'Applicant name'], ['sellerEmail', 'Email'], ['sellerPhone', 'Phone'],
  ['locationCity', 'City'], ['locationProvince', 'Province / state'], ['locationCountry', 'Country'],
  ['location', 'Submitted location'], ['reserveExpectation', 'Reserve expectation (CAD)'],
  ['notes', 'Mechanical / condition disclosures and applicant notes'],
  ['applicantType', 'Applicant classification'], ['submittedDealershipName', 'Submitted dealership name'],
  ['dealershipName', 'Dealership name'], ['submittedDealerLicenseNumber', 'Submitted license number'],
  ['dealerLicenseNumber', 'License number'], ['submittedLicensingJurisdiction', 'Submitted jurisdiction'],
  ['licensingJurisdiction', 'Jurisdiction'], ['dealershipOwnershipDeclaration', 'Exclusive ownership declaration'],
  ['legalSellerOfRecordDeclaration', 'Seller-of-record declaration']
];
const metadata = new Set(['id', 'reviewSource', 'status', 'submittedAt', 'reviewedAt', 'reviewedBy', 'updatedAt',
  'convertedAuctionId', 'registeredUserId', 'registeredUserRole', 'isRegisteredUser', 'sellerId',
  'sellerType', 'dealerId', 'dealerSnapshot', 'dealerDocFee', 'taxHandling', 'taxDisclaimerVersion',
  'verifiedAt', 'verifierUid', 'verificationStatus', 'verificationMethod', 'verificationExpiresAt', 'verificationRecordVersion']);
function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Declared yes' : 'Declared no';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
function timestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? formatDateTime(value) : 'Not recorded';
}

export function ConsignmentReviewModal({ application, user, onClose }: {
  application: ConsignmentApplication; user: User; onClose: () => void;
}) {
  const [detail, setDetail] = useState<ConsignmentReviewDetail | null>(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  const pendingCommands = useRef(new Map<string, string>());
  const source = application.reviewSource ?? 'consignment_applications';
  const base = { applicationId: application.id, source };

  useEffect(() => {
    let cancelled = false;
    consignmentReviewRequest(user, { applicationId: application.id, source, action: 'read' })
      .then(value => { if (!cancelled) { setDetail(value); setAssignee(value.review.assigneeEmail || ''); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [application.id, source, user]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const close = () => {
    if (busy || ((note.trim() || (detail && assignee !== (detail.review.assigneeEmail || ''))) &&
      !window.confirm('Discard unsaved review changes?'))) return;
    onClose();
  };
  async function reload() {
    setBusy(true); setError('');
    try {
      const value = await consignmentReviewRequest(user, { ...base, action: 'read' });
      setDetail(value); setAssignee(value.review.assigneeEmail || '');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function save(action: 'add_note' | 'assign') {
    if (!detail) return;
    setBusy(true); setError('');
    const payload = { ...base, action, expectedRevision: detail.review.revision,
      ...(action === 'add_note' ? { note } : { assigneeEmail: assignee }) };
    const { expectedRevision: _revision, ...command } = payload;
    const key = JSON.stringify(command);
    if (!pendingCommands.current.has(key)) pendingCommands.current.set(key, crypto.randomUUID());
    try {
      await consignmentReviewRequest(user, { ...payload, commandId: pendingCommands.current.get(key) });
      pendingCommands.current.delete(key);
      if (action === 'add_note') setNote('');
      const value = await consignmentReviewRequest(user, { ...base, action: 'read' });
      setDetail(value); setAssignee(value.review.assigneeEmail || '');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function older() {
    if (!detail?.events.length) return;
    setBusy(true); setError('');
    try {
      const value = await consignmentReviewRequest(user, { ...base, action: 'read',
        beforeRevision: detail.events[detail.events.length - 1].revision });
      setDetail({ ...detail, events: [...detail.events, ...value.events], hasMore: value.hasMore });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const record = detail?.application;
  const extraFields = record ? Object.keys(record).filter(key => !metadata.has(key) && !fields.some(([field]) => field === key)) : [];
  return <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-3">
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="consignment-review-title"
      className="bg-slate-900 text-white rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-5"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
          const nodes = Array.from(dialog.current?.querySelectorAll('button:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || []) as HTMLElement[];
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="flex justify-between gap-4"><h2 id="consignment-review-title" className="text-xl font-bold">Application review</h2>
        <button type="button" disabled={busy} onClick={close} aria-label="Close application review">Close</button></div>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button type="button" onClick={reload} disabled={busy || loading} className="underline">Reload review</button>
      {loading && <p role="status">Loading application…</p>}
      {record && <>
        <p>Status: <strong data-testid="review-status">{record.status || 'pending'}</strong>. Viewing and saving internal notes do not change this status.</p>
        <section aria-label="Applicant-submitted information" className="space-y-3">
          <h3 className="font-bold text-lg">Applicant-submitted information</h3>
          <p className="text-sm text-slate-300">Declarations are supplied by the applicant and do not establish verification. Missing fields have not been collected or supplied.</p>
          <dl className="grid sm:grid-cols-2 gap-4">{[...fields, ...extraFields.map(key => [key, key])].map(([key, label]) =>
            <div key={key}><dt className="text-sm text-slate-400">{label}</dt><dd className="whitespace-pre-wrap break-words">{display(record[key])}</dd></div>)}</dl>
        </section>
        <section aria-label="Administrator verification information" className="border-t border-slate-700 pt-4 space-y-2">
          <h3 className="font-bold text-lg">Administrator verification information</h3>
          {detail.verifiedInformation ? <><p>Existing canonical dealer profile. Status and expiry below are recorded values; reviewing this application does not verify a dealer.</p>
            <dl>{Object.entries(detail.verifiedInformation).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{key.endsWith('At') ? timestamp(value) : display(value)}</dd></div>)}</dl></>
            : <p>No linked canonical dealer verification information. Not verified by this review.</p>}
        </section>
        <section aria-label="Recorded administration" className="space-y-2 border-t border-slate-700 pt-4">
          <h3 className="font-bold text-lg">Recorded administration</h3>
          <p>Submitted: {timestamp(record.submittedAt)}</p>
          <p>Existing review timestamp: {timestamp(record.reviewedAt)}</p>
          <p>Existing reviewer: {display(record.reviewedBy)}</p>
          <p className="text-sm text-slate-300">Legacy metadata does not provide a complete review history. No earlier events are reconstructed. Dealer verification is a separate milestone; this review grants no verified status.</p>
          <details><summary>Existing administrative metadata</summary><dl>{Object.entries(record).filter(([key]) => metadata.has(key) && !['reviewSource', 'submittedAt', 'reviewedAt', 'reviewedBy', 'status'].includes(key)).map(([key, value]) =>
            <div key={key}><dt>{key}</dt><dd className="whitespace-pre-wrap break-words">{display(value)}</dd></div>)}</dl></details>
        </section>
        <section aria-label="Private curator review" className="border-t border-slate-700 pt-4 space-y-3">
          <h3 className="font-bold text-lg">Private curator review</h3>
          <p className="text-sm text-slate-300">Visible only to designated administrators. Notes are retained in the review history.</p>
          <label className="block">Assigned curator<select aria-label="Assigned curator" value={assignee} disabled={busy}
            onChange={event => setAssignee(event.target.value)} className="block bg-slate-800 p-2 w-full">
            <option value="">Unassigned</option>{DESIGNATED_ADMIN_EMAILS.map(email => <option key={email}>{email}</option>)}
          </select></label>
          <button type="button" disabled={busy || assignee === (detail.review.assigneeEmail || '')} onClick={() => save('assign')} className="rounded bg-slate-700 px-4 py-2 disabled:opacity-50">Save assignment</button>
          <label className="block">Internal note<textarea aria-label="Internal note" value={note} maxLength={4000} disabled={busy}
            onChange={event => setNote(event.target.value)} className="block bg-slate-800 p-2 w-full min-h-28" /></label>
          <button type="button" disabled={busy || !note.trim()} onClick={() => save('add_note')} className="rounded bg-emerald-800 px-4 py-2 disabled:opacity-50">Save internal note</button>
          {busy && <p role="status">Saving or loading review…</p>}
          <h4 className="font-bold">Review history</h4>
          {!detail.events.length && <p>No internal review events recorded.</p>}
          <ol className="space-y-3">{detail.events.map(event => <li key={event.id} className="border border-slate-700 p-3 rounded">
            <p className="text-sm text-slate-400">{formatDateTime(event.createdAt)} · {event.administratorEmail} · #{event.revision}</p>
            <p className="whitespace-pre-wrap break-words">{event.action === 'assign' ? `Curator assignment: ${event.value || 'Unassigned'}` : event.value}</p>
          </li>)}</ol>
          {detail.hasMore && <button type="button" disabled={busy} onClick={older}>Load older review events</button>}
        </section>
      </>}
    </div>
  </div>;
}
