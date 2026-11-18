import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminDealerStatus, dealerVerificationLabel } from '../src/components/AdminDealerStatus';
import type { DealerProfile } from '../src/types';

test('current verification requires a future valid expiry; suspension overrides expiry', () => {
  assert.equal(dealerVerificationLabel({ verificationStatus: 'verified', verificationExpiresAt: 1001 }, 1000), 'Current');
  for (const expiry of [undefined, 1000, 999, NaN]) assert.equal(dealerVerificationLabel({ verificationStatus: 'verified', verificationExpiresAt: expiry }, 1000), 'Expired');
  assert.equal(dealerVerificationLabel({ verificationStatus: 'suspended', verificationExpiresAt: 2000 }, 1000), 'Suspended');
  assert.equal(dealerVerificationLabel(undefined, 1000), 'Not verified');
});
test('text and colours distinguish outcomes and loading failures never show current', () => {
  for (const [status, label, colour] of [['verified', 'Current', 'emerald'], ['suspended', 'Suspended', 'amber'], ['rejected', 'Rejected', 'red'], ['pending', 'Pending verification', 'blue'], ['unverified', 'Not verified', 'zinc']] as const) {
    const profile = { verificationStatus: status, verificationExpiresAt: 2000 } as DealerProfile;
    const html = renderToStaticMarkup(React.createElement(AdminDealerStatus, { profile, now: 1000 }));
    assert.ok(html.includes(`Dealer verification: ${label}`)); assert.ok(html.includes(`border-${colour}`));
    assert.ok(renderToStaticMarkup(React.createElement(AdminDealerStatus, { profile, now: 1000, unavailable: true })).includes('Status unavailable'));
  }
  assert.ok(renderToStaticMarkup(React.createElement(AdminDealerStatus, { now: 1000, caseStatus: 'rejected', pending: true })).includes('Rejected'));
});
