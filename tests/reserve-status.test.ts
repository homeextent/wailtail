import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveStatus } from '../src/utils/reserveStatus';

test('public and administrator reserve states agree without exposing the amount', () => {
  for (const isReserveMet of [false, true]) {
    assert.equal(reserveStatus({ reserveAmount: 5000, isReserveMet }), reserveStatus({ hasReserve: true, isReserveMet }));
    assert.equal(reserveStatus({ hasReserve: true, isReserveMet }), isReserveMet ? 'met' : 'not_met');
    assert.equal(reserveStatus({ reserveAmount: 0, isReserveMet }), 'none');
    assert.equal(reserveStatus({ hasReserve: false, isReserveMet }), 'none');
  }
});

test('withheld, missing and malformed reserve data never imply no reserve or reserve met', () => {
  for (const reserveAmount of [undefined, null, NaN, Infinity, -1, '0']) {
    assert.equal(reserveStatus({ reserveAmount, isReserveMet: true }), 'unknown');
  }
  assert.equal(reserveStatus({ hasReserve: true, isReserveMet: 'true' }), 'not_met');
  assert.equal(reserveStatus({ reserveAmount: 5000, hasReserve: false, isReserveMet: false }), 'not_met');
});

test('catalog renders public guest/member and administrator reserve data consistently', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CatalogCard } = await import('../src/components/CatalogCard');
  const base = { id: 'reserve-example', status: 'upcoming', title: 'Reserve example', startTime: Date.now() + 10000, endTime: Date.now() + 20000, currentBid: 1000, startingBid: 1000, bidCount: 1 };
  for (const isAdmin of [false, true]) {
    for (const isReserveMet of [false, true]) {
      const lot = { ...base, isReserveMet, ...(isAdmin ? { reserveAmount: 5000 } : { hasReserve: true }) };
      const html = renderToStaticMarkup(React.createElement(CatalogCard, { lot: lot as any, isAdmin, onSelectAuction() {} }));
      assert.ok(!html.includes('No Reserve'));
      assert.equal(html.includes('Reserve Met'), isReserveMet);
      assert.ok(!html.includes('5000'), 'private threshold is not rendered');
    }
    const noReserve = renderToStaticMarkup(React.createElement(CatalogCard, { lot: { ...base, hasReserve: false, ...(isAdmin ? { reserveAmount: 0 } : {}) } as any, isAdmin, onSelectAuction() {} }));
    assert.ok(noReserve.includes('No Reserve'));
    const unknown = renderToStaticMarkup(React.createElement(CatalogCard, { lot: base as any, isAdmin, onSelectAuction() {} }));
    assert.ok(!unknown.includes('No Reserve') && !unknown.includes('Reserve Met'));
  }
});
