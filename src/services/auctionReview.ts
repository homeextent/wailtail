import type { User } from 'firebase/auth';

export async function requestAuctionReturnToDraft(
  user: User,
  auctionId: string,
  expectedRevision: number,
  notes = ''
) {
  const response = await fetch('/api/admin-return-auction-to-draft', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auctionId, expectedRevision, notes })
  });
  if (response.status === 409) throw new Error('The listing changed. Reload before trying again.');
  if (!response.ok) throw new Error('Could not return the listing to draft.');
}
