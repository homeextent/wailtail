import type { User } from 'firebase/auth';
import type { ConsignmentApplication } from '../types';

export type ConsignmentSource = 'consignment_applications' | 'consignments';
export interface ConsignmentReviewEvent {
  id: string;
  action: 'add_note' | 'assign';
  value: string;
  revision: number;
  createdAt: number;
  administratorUid: string;
  administratorEmail: string;
}
export interface ConsignmentReviewDetail {
  application: ConsignmentApplication & Record<string, unknown>;
  verifiedInformation: Record<string, unknown> | null;
  review: { revision: number; assigneeEmail?: string };
  events: ConsignmentReviewEvent[];
  hasMore: boolean;
}
export async function consignmentReviewRequest(user: User, input: Record<string, unknown>) {
  const response = await fetch('/api/admin-consignment-review', {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (response.status === 409) throw new Error('Another review was saved. Reload the review before trying again. Your unsaved text is retained.');
  if (!response.ok) throw new Error('Could not complete the review request. Your unsaved text is retained.');
  return response.json();
}
