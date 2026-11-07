import { handleSellerDraftSubmission } from './seller-draft-narrative.js';

export default function handler(req: any, res: any) {
  return handleSellerDraftSubmission(req, res);
}
