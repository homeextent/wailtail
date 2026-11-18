/** Public reserve presence is explicit; a withheld amount is never zero. */
export function reservePresence(auction: { reserveAmount?: unknown; hasReserve?: unknown }): boolean | undefined {
  if (typeof auction.reserveAmount === 'number' && Number.isFinite(auction.reserveAmount) && auction.reserveAmount >= 0) {
    return auction.reserveAmount > 0;
  }
  return typeof auction.hasReserve === 'boolean' ? auction.hasReserve : undefined;
}

export function reserveStatus(auction: { reserveAmount?: unknown; hasReserve?: unknown; isReserveMet?: unknown }) {
  const presence = reservePresence(auction);
  if (presence === false) return 'none';
  if (presence === undefined) return 'unknown';
  return auction.isReserveMet === true ? 'met' : 'not_met';
}
