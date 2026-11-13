export async function callListing(handler: any, body: any, services: any, method = 'POST', headers: any = { authorization: 'Bearer synthetic' }) {
  const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(data: any) { this.data = data; return this; } };
  await handler({ method, headers, body }, res, services); return res;
}
