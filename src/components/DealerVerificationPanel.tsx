import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { CANADIAN_LICENSING_JURISDICTIONS } from '../config/consignmentIntake';
import { DEALER_VERIFICATION_METHODS, DEALER_VERIFICATION_SOURCES, dealerLocalDateInput, parseDealerLocalDate } from '../config/dealerVerification';
import { formatDateTime } from '../utils/formatters';
import type { ConsignmentSource } from '../services/consignmentReview';

const textFields = [
  ['legalBusinessName', 'Verified legal business name'], ['dbaName', 'Trade name / DBA (optional)'],
  ['dealerLicenseNumber', 'Verified dealer licence number'], ['primaryRepresentativeUid', 'Primary representative Firebase UID'],
  ['streetAddress', 'Business street address'], ['postalCode', 'Business postal code'], ['city', 'Business city'],
  ['phone', 'Business phone'], ['website', 'Website (optional, https://)']
] as const;
const empty = { legalBusinessName: '', dbaName: '', dealerLicenseNumber: '', primaryRepresentativeUid: '',
  streetAddress: '', postalCode: '', city: '', phone: '', website: '', province: '', licensingJurisdiction: '',
  displayPhonePublicly: false, displayWebsitePublicly: false, verificationExpiresAt: 0 };
const dateInput = dealerLocalDateInput;
const dateLabel = (value: unknown) => typeof value === 'number' ? formatDateTime(value) : 'Not recorded';
export function DealerVerificationPanel({ user, applicationId, source, onBack }: {
  user: User; applicationId: string; source: ConsignmentSource; onBack: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [profile, setProfile] = useState(empty);
  const [action, setAction] = useState('reviewed');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('');
  const [methodChoice, setMethodChoice] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [lookupType, setLookupType] = useState('email');
  const [account, setAccount] = useState<any>(null);
  const [reference, setReference] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const commands = useRef(new Map<string, string>());
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error && !message) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [error, message]);
  const needsProfile = ['verified', 'updated', 'renewed'].includes(action);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parseCheckTime = (value: string) => parseDealerLocalDate(value, detail?.profile?.checkedAt);
  const parseExpiryTime = (value: string) => parseDealerLocalDate(value, detail?.profile?.verificationExpiresAt);
  async function request(input: Record<string, unknown>) {
    const response = await fetch('/api/admin-dealer-verification', { method: 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, source, ...input }) });
    const data = await response.json();
    if (!response.ok && data.error === 'representative-account-not-found') throw new Error('No account matches that exact email or UID. Confirm the details; a guest must register and verify their email first. Unsaved entries are retained.');
    if (!response.ok) throw new Error(`Could not save or load verification: ${data.error || response.status}. Unsaved entries are retained.`);
    return data;
  }
  function load(value: any) {
    setDetail(value);
    if (value.profile) {
      setProfile({ ...empty, ...value.profile }); setExpiry(dateInput(value.profile.verificationExpiresAt));
      setMethod(value.profile.verificationMethod || ''); setReference(value.profile.sourceReferenceDescription || '');
      setMethodChoice(DEALER_VERIFICATION_METHODS.some(item => item === value.profile.verificationMethod) ? value.profile.verificationMethod : 'Other');
      setSourceType(value.profile.sourceReferenceType || 'Other');
      setCheckedAt(dateInput(value.profile.checkedAt));
    }
  }
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    request({ action: 'read' }).then(value => { if (!cancelled) load(value); })
      .catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // The selected application and authenticated user define this panel's lifetime.
  }, [applicationId, source, user]);
  async function lookupAccount() {
    setBusy(true); setError(''); setMessage(''); setAccount(null);
    try { setAccount((await request({ action: 'lookup_account', accountLookupType: lookupType, accountQuery: accountQuery.trim() })).account); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!detail) return;
    setBusy(true); setError(''); setMessage('');
    const visible = new FormData(event.currentTarget as HTMLFormElement);
    const clean = Object.fromEntries(Object.keys(empty).map(key => [key,
      typeof profile[key as keyof typeof empty] === 'string' ? String(visible.get(key) ?? profile[key as keyof typeof empty]) : profile[key as keyof typeof empty]]));
    clean.displayPhonePublicly = visible.has('displayPhonePublicly'); clean.displayWebsitePublicly = visible.has('displayWebsitePublicly');
    const visibleReason = String(visible.get('reason') ?? reason);
    setReason(visibleReason);
    if (needsProfile) setProfile(clean as typeof empty);
    const checkedTimestamp = parseCheckTime(String(visible.get('checkedAt') || ''));
    const expiryTimestamp = parseExpiryTime(String(visible.get('expiry') || ''));
    if (needsProfile && (!clean.primaryRepresentativeUid || !Number.isFinite(checkedTimestamp) || !Number.isFinite(expiryTimestamp))) {
      setError('Select a representative account and enter valid local check and expiry times. A clock time skipped by daylight saving cannot be used.');
      setBusy(false); return;
    }
    const payload = { action, expectedRevision: detail.review.revision, reason: visibleReason,
      ...(needsProfile ? { profile: { ...clean, verificationExpiresAt: expiryTimestamp },
        verificationMethod: visible.get('methodChoice') === 'Other' ? String(visible.get('method')) : String(visible.get('methodChoice')),
        sourceReferenceType: String(visible.get('sourceType')), sourceReferenceDescription: String(visible.get('reference')),
        checkedAt: checkedTimestamp } : {}) };
    const key = JSON.stringify(payload);
    if (!commands.current.has(key)) commands.current.set(key, crypto.randomUUID());
    try {
      await request({ ...payload, commandId: commands.current.get(key) });
      commands.current.delete(key); setDirty(false); setReason(''); setMessage('Verification action saved. Vehicle review and account roles are unchanged.');
      load(await request({ action: 'read' }));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm('Discard unsaved verification entries and reload?')) return;
    setBusy(true); setError('');
    try { load(await request({ action: 'read' })); setDirty(false); } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function older() {
    setBusy(true);
    try {
      const value = await request({ action: 'read', beforeRevision: detail.events.at(-1).revision });
      setDetail({ ...detail, events: [...detail.events, ...value.events], hasMore: value.hasMore });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <section aria-label="Dealer verification" className="space-y-5">
    <div className="flex flex-wrap gap-4"><h3 className="text-xl font-bold">Dealer verification</h3>
      <button disabled={busy} type="button" className="underline" onClick={() => {
        if (!dirty || window.confirm('Discard unsaved verification entries?')) onBack();
      }}>Back to application</button><button type="button" disabled={busy} className="underline" onClick={reload}>Reload verification</button></div>
    {(error || message) && <div ref={feedback} tabIndex={-1} aria-label="Verification result" className="rounded border border-slate-600 p-4 focus:outline focus:outline-2 focus:outline-slate-400">
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {message && <p role="status" className="text-emerald-300">{message}</p>}
    </div>}
    {busy && <p role="status">Loading or saving verification…</p>}
    {detail && <>
      <section className="rounded border border-slate-600 p-4 space-y-2">
        <h4 className="font-bold">Applicant declarations (unverified)</h4>
        <p>{detail.application.submittedDealershipName || detail.application.dealershipName || 'Name not supplied'} · {detail.application.sellerName} · {detail.application.sellerEmail}</p>
        <p>Licence: {detail.application.submittedDealerLicenseNumber || 'Not supplied'} · {detail.application.submittedLicensingJurisdiction || 'Not supplied'}</p>
        <p>Ownership: {String(detail.application.dealershipOwnershipDeclaration ?? false)} · Seller of record: {String(detail.application.legalSellerOfRecordDeclaration ?? false)} · No brokered inventory: {String(detail.application.noBrokeredInventoryDeclaration ?? false)}</p>
        <p className="text-sm text-slate-300">Confirm these claims independently. Vehicle location is not the dealership business address. Opening this view makes no changes.</p>
      </section>
      <p>Verification status: <strong data-testid="dealer-verification-status">{detail.profile?.verificationStatus || detail.review.verificationStatus}</strong>
        {detail.profile && <> · Expires: {dateLabel(detail.profile.verificationExpiresAt)}{detail.profile.verificationExpiresAt <= Date.now() && <strong className="text-amber-300"> (expired: dealer listing changes blocked)</strong>}</>}</p>
      <p className="text-sm text-slate-300">Find the representative's existing account by exact email or UID, confirm their identity and authority, then explicitly select it. Lookup makes no changes. Guests remain pending until an eligible account exists. Saving rechecks account eligibility and protected links. Verification does not approve this vehicle, create a lot, or promote an account role.</p>
      <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Action<select aria-label="Verification action" value={action} onChange={e => setAction(e.target.value)} className="block w-full bg-slate-800 p-3">
            <option value="reviewed">Record review / keep current status</option><option value="verified">Verify / reverify and create or restore profile</option>
            <option value="rejected">Reject dealer verification</option><option value="suspended" disabled={!detail.profile}>Suspend dealer</option>
            <option value="updated" disabled={!detail.profile}>Update verified profile</option><option value="renewed" disabled={!detail.profile}>Renew verification</option>
          </select></label>
          {needsProfile && <>
            <h4 className="font-bold">Administrator-confirmed canonical information</h4>
            {!detail.profile && <section aria-label="Representative account selector" className="rounded border border-slate-600 p-4 space-y-3">
              <h5 className="font-bold">Find and confirm the primary representative</h5>
              <label className="block">Look up by<select aria-label="Account lookup type" value={lookupType} onChange={e => { setLookupType(e.target.value); setAccount(null); }} className="block bg-slate-800 p-3 w-full"><option value="email">Exact email address</option><option value="uid">Exact Firebase UID</option></select></label>
              <label className="block">Account email or UID<input aria-label="Account lookup value" maxLength={254} value={accountQuery} onChange={e => { setAccountQuery(e.target.value); setAccount(null); }} className="block bg-slate-800 p-3 w-full" /></label>
              <button type="button" onClick={lookupAccount} disabled={!accountQuery.trim()} className="underline disabled:opacity-50">Find representative account</button>
              {account && <div aria-label="Representative account result" className="space-y-2 break-words">
                <p>Name: {account.displayName || 'Not supplied'} · Email: <span data-testid="representative-account-email">{account.email || 'Not supplied'}</span></p>
                <p>UID: {account.uid}</p><p>Email verified: {account.emailVerified ? 'Yes' : 'No'} · Account enabled: {account.disabled ? 'No' : 'Yes'}</p>
                <p>{account.eligibilityMessage}</p>
                <button type="button" disabled={!account.eligible} className="rounded bg-emerald-800 p-3 disabled:opacity-50" onClick={() => { setProfile({ ...profile, primaryRepresentativeUid: account.uid }); setDirty(true); }}>Confirm and select this representative</button>
              </div>}
              <p className="text-sm text-slate-300">Selection only fills the UID below; it grants no access. Confirm authority independently and document it in your findings. Exact lookup does not search or list all accounts.</p>
            </section>}
            <div className="grid sm:grid-cols-2 gap-4">{textFields.map(([key, label]) => <label key={key}>{label}{!['dbaName', 'website'].includes(key) && ' *'}
              <input name={key} aria-label={label} required={!['dbaName', 'website'].includes(key)} maxLength={240}
                readOnly={key === 'primaryRepresentativeUid' || (!!detail.profile && key === 'dealerLicenseNumber')}
                value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} className="block w-full bg-slate-800 p-3 rounded" />
            </label>)}
            {([['licensingJurisdiction', 'Licensing province / territory'], ['province', 'Business province / territory']] as const).map(([key, label]) =>
              <label key={key}>{label} *<select name={key} aria-label={label} required value={profile[key]} disabled={!!detail.profile && key === 'licensingJurisdiction'}
                onChange={e => setProfile({ ...profile, [key]: e.target.value })} className="block w-full bg-slate-800 p-3 rounded">
                <option value="">Select…</option>{CANADIAN_LICENSING_JURISDICTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select></label>)}
            </div>
            <p className="text-sm text-slate-300">Licence identity and primary representative cannot be reassigned in M2.3. Public contact consent defaults off. Record how consent was obtained in your findings; this milestone publishes no contact details.</p>
            <label className="block"><input name="displayPhonePublicly" type="checkbox" checked={profile.displayPhonePublicly} onChange={e => setProfile({ ...profile, displayPhonePublicly: e.target.checked })} /> Explicit consent obtained to display phone publicly</label>
            <label className="block"><input name="displayWebsitePublicly" type="checkbox" checked={profile.displayWebsitePublicly} onChange={e => setProfile({ ...profile, displayWebsitePublicly: e.target.checked })} /> Explicit consent obtained to display website publicly</label>
            <label className="block">Verification method *<select name="methodChoice" aria-label="Verification method" required value={methodChoice} onChange={e => { setMethodChoice(e.target.value); setMethod(''); }} className="block bg-slate-800 p-3 w-full">
              <option value="">Select method…</option>{DEALER_VERIFICATION_METHODS.map(item => <option key={item}>{item}</option>)}<option value="Other">Other</option>
            </select></label>
            {methodChoice === 'Other' && <label className="block">Describe other verification method *<input name="method" aria-label="Other verification method" required maxLength={1000} value={method} onChange={e => setMethod(e.target.value)} className="block bg-slate-800 p-3 w-full" /></label>}
            <p className="text-sm text-slate-300">Describe how you checked business credentials and representative authority. These choices guide a human review; selecting one does not perform or establish verification.</p>
            <label className="block">Source type *<select name="sourceType" aria-label="Verification source type" required value={sourceType} onChange={e => setSourceType(e.target.value)} className="block bg-slate-800 p-3 w-full">
              <option value="">Select source…</option>{DEALER_VERIFICATION_SOURCES.map(item => <option key={item}>{item}</option>)}
            </select></label>
            <label className="block">{sourceType === 'Other' ? 'Describe other source / reference *' : 'Source / reference description *'}<textarea name="reference" aria-label="Source / reference description" required maxLength={2000} placeholder="Name the register or document, record/licence reference, and relevant date. List each source if using combined records." value={reference} onChange={e => setReference(e.target.value)} className="block bg-slate-800 p-3 w-full" /></label>
            <p className="text-sm text-slate-300">Identify the actual evidence consulted so another administrator can locate it. Example: licensing-register entry for TEST-123 and representative authorization letter dated November 6. A source category alone is insufficient.</p>
            <p className="text-sm text-slate-300">Enter local dates and times in <strong>{localTimezone}</strong>, using the date picker. Stored timestamps remain absolute. The preview below shows each selected timezone offset; repeated daylight-saving clock times use the earlier occurrence.</p>
            <div className="grid sm:grid-cols-2 gap-4"><label>Manual check date and time ({localTimezone}) *<input name="checkedAt" aria-label="Manual check time local" type="datetime-local" required value={checkedAt} onChange={e => setCheckedAt(e.target.value)} className="block bg-slate-800 p-3 w-full" />
              <span className="text-sm text-slate-300">When you completed the checks; cannot be in the future. {checkedAt && Number.isFinite(parseCheckTime(checkedAt)) && new Date(parseCheckTime(checkedAt)).toString()}</span></label>
              <label>Verification expires ({localTimezone}) *<input name="expiry" aria-label="Verification expiry local" type="datetime-local" required value={expiry} onChange={e => setExpiry(e.target.value)} className="block bg-slate-800 p-3 w-full" />
              <span className="text-sm text-slate-300">Future review deadline under WAILTAIL policy; no standard duration is assumed. {expiry && Number.isFinite(parseExpiryTime(expiry)) && new Date(parseExpiryTime(expiry)).toString()}</span></label></div>
          </>}
          <label className="block">Private findings / decision reason *<textarea name="reason" aria-label="Verification findings" required maxLength={4000} placeholder="Summarize what matched, discrepancies, representative authority, contact consent, and why this decision is appropriate." value={reason} onChange={e => setReason(e.target.value)} className="block bg-slate-800 p-3 w-full min-h-24" /></label>
          <p className="text-sm text-slate-300">Record your conclusion, not just the checking method. Example: business name and licence matched; representative authority confirmed; verification approved; public contact display not authorized. Findings stay private and are recorded in the audit.</p>
          <button type="submit" className="rounded bg-orange-700 px-4 py-3 disabled:opacity-50">Save verification action</button>
        </fieldset>
      </form>
      <section className="border-t border-slate-700 pt-4 space-y-3"><h4 className="font-bold">Immutable private verification history</h4>
        {!detail.events.length && <p>No verification actions recorded.</p>}
        <ol className="space-y-3">{detail.events.map((event: any) => <li key={event.id} className="border border-slate-700 rounded p-3">
          <p>{event.action} · #{event.revision} · {dateLabel(event.timestamp)} · {event.administratorEmail}</p><p className="whitespace-pre-wrap">{event.reason}</p>
          <details><summary>Recorded before / after</summary><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details>
        </li>)}</ol>{detail.hasMore && <button type="button" disabled={busy} onClick={older}>Load older verification events</button>}
      </section>
    </>}
  </section>;
}
