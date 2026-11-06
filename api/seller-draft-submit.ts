import { handleSellerDraftSubmission } from './seller-draft-narrative';

export default function handler(req: any, res: any) {
  return handleSellerDraftSubmission(req, res);
}
