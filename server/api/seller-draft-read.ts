import { handleSellerDraftRead } from './seller-draft-narrative';

export default function handler(req: any, res: any) {
  return handleSellerDraftRead(req, res);
}
