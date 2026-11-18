import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicDealerDisclosure } from '../src/components/PublicDealerDisclosure';
import { VerifiedDealerBadge } from '../src/components/VerifiedDealerBadge';
import type { PublicDealerSummary } from '../src/types';

const dealer = { name: 'Example dealer', city: 'Toronto', province: 'ON', verified: true,
  documentationFee: 0, taxHandling: 'dealer_collects' } as PublicDealerSummary;

test('regular and compact badges retain the brand, readable label and existing SVG icon', () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(VerifiedDealerBadge, { compact }));
    assert.match(html, /WAILTAIL/);
    assert.match(html, /Verified Boutique Dealer/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /Certified|Inspected|OMVIC|VSA/);
  }
});

test('only currently verified dealer disclosures display the branded credential', () => {
  for (const compact of [false, true]) {
    const current = renderToStaticMarkup(React.createElement(PublicDealerDisclosure, { dealer, compact }));
    assert.match(current, /Verified Boutique Dealer/);
    const historical = renderToStaticMarkup(React.createElement(PublicDealerDisclosure, { dealer: { ...dealer, verified: false }, compact }));
    assert.match(historical, /Dealer-listed vehicle/);
    assert.doesNotMatch(historical, /Verified Boutique Dealer|<svg/);
    assert.match(historical, /Example dealer/);
    if (!compact) {
      assert.match(current, /Dealer documentation fee: CAD \$0/);
      assert.match(current, /not provincial regulatory endorsement/);
      assert.match(historical, /Historical dealer attribution/);
    }
  }
  assert.equal(renderToStaticMarkup(React.createElement(PublicDealerDisclosure, {})), '');
});
