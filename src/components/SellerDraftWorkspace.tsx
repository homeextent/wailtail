import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

interface Draft {
  title: string;
  status: 'draft' | 'pending_review';
  revision: number;
  overviewHeading: string;
  overviewParagraphs: string[];
}

async function draftRequest<T>(user: User, operation: string, body: object, signal?: AbortSignal): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/seller-draft-${operation}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error('The listing changed. Reload it before trying again.');
    if (response.status === 404) throw new Error('This listing is unavailable to your account.');
    if (response.status === 422) throw new Error('Check the draft fields or ask an administrator to complete the listing details.');
    throw new Error('The listing operation failed. Please try again.');
  }
  return response.json() as Promise<T>;
}

export function SellerDraftWorkspace({ auctionId, user, onBack }: {
  auctionId: string;
  user: User;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [heading, setHeading] = useState('');
  const [paragraphs, setParagraphs] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    draftRequest<Draft>(user, 'read', { auctionId }, controller.signal).then(record => {
      if (controller.signal.aborted) return;
      setDraft(record);
      setHeading(record.overviewHeading);
      setParagraphs(record.overviewParagraphs.join('\n\n'));
    }).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [auctionId, user]);

  const dirty = draft !== null &&
    (heading !== draft.overviewHeading || paragraphs !== draft.overviewParagraphs.join('\n\n'));
  const editable = draft?.status === 'draft';

  async function apply(operation: 'narrative' | 'submit') {
    if (!draft || !editable || busy || (operation === 'submit' && dirty)) return;
    setBusy(true);
    setError('');
    setMessage('');
    const overviewParagraphs = paragraphs.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
    try {
      const result = await draftRequest<{ revision: number; status?: Draft['status'] }>(user, operation, {
        auctionId,
        expectedRevision: draft.revision,
        ...(operation === 'narrative' ? { overviewHeading: heading, overviewParagraphs } : {})
      });
      if (operation === 'narrative') setParagraphs(overviewParagraphs.join('\n\n'));
      setDraft({
        ...draft,
        revision: result.revision,
        status: result.status ?? draft.status,
        ...(operation === 'narrative' ? { overviewHeading: heading, overviewParagraphs } : {})
      });
      setMessage(operation === 'submit' ? 'Listing submitted for review.' : 'Narrative saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The listing operation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <button type="button" onClick={onBack}>Back to dashboard</button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!draft && !error && <p>Loading listing…</p>}
      {draft && <>
        <h1 className="text-2xl font-bold">{draft.title}</h1>
        {!editable && <p>This listing is read-only while it is under review.</p>}
        <fieldset disabled={!editable || busy} className="space-y-4">
          <label className="block">Overview heading
            <input className="block w-full rounded border p-2" maxLength={240}
              value={heading} onChange={event => setHeading(event.target.value)} />
          </label>
          <label className="block">Overview paragraphs
            <textarea className="block w-full rounded border p-2" rows={12}
              value={paragraphs} onChange={event => setParagraphs(event.target.value)} />
          </label>
          <div className="flex gap-4">
            <button type="button" disabled={!dirty} onClick={() => void apply('narrative')}>Save narrative</button>
            <button type="button" disabled={dirty} onClick={() => void apply('submit')}>Submit for review</button>
          </div>
        </fieldset>
      </>}
    </main>
  );
}
