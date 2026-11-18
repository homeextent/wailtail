import React from 'react';
import type { DealerProfile } from '../types';

export function dealerVerificationLabel(profile: Pick<DealerProfile, 'verificationStatus' | 'verificationExpiresAt'> | undefined, now: number) {
  if (!profile) return 'Not verified';
  if (profile.verificationStatus === 'verified') return Number.isSafeInteger(profile.verificationExpiresAt) && profile.verificationExpiresAt! > now ? 'Current' : 'Expired';
  return ({ suspended: 'Suspended', pending: 'Pending verification', rejected: 'Rejected', unverified: 'Not verified' })[profile.verificationStatus] || 'Not verified';
}
const colours: Record<string, string> = {
  Current: 'border-emerald-700 bg-emerald-950 text-emerald-300',
  Expired: 'border-red-700 bg-red-950 text-red-300',
  Rejected: 'border-red-700 bg-red-950 text-red-300',
  Suspended: 'border-amber-700 bg-amber-950 text-amber-300',
  'Pending verification': 'border-blue-700 bg-blue-950 text-blue-300',
};
export function AdminDealerStatus({ profile, now, pending = false, unavailable = false, caseStatus }: { profile?: DealerProfile; now: number; pending?: boolean; unavailable?: boolean; caseStatus?: string }) {
  const label = unavailable ? 'Status unavailable' : profile ? dealerVerificationLabel(profile, now) : caseStatus === 'rejected' ? 'Rejected' : caseStatus === 'suspended' ? 'Suspended' : caseStatus === 'verified' ? 'Status unavailable' : pending ? 'Pending verification' : 'Not verified';
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${colours[label] || 'border-zinc-600 bg-zinc-800 text-zinc-300'}`}>Dealer verification: {label}</span>;
}
export function SellerTypeFilter({ label, value, onChange, members = false }: { label: string; value: string; onChange: (value: string) => void; members?: boolean }) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="max-w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100">
    <option value="ALL">{members ? 'All dealer affiliations' : 'All seller types'}</option>
    <option value="dealer">{members ? 'Dealer representatives' : 'Dealer'}</option>
    <option value="private">{members ? 'No dealer affiliation' : 'Private seller'}</option>
  </select>;
}
