/** Keep asynchronous upload failures attached to the caller's promise. */
export async function readAndUploadImage(file: Blob, upload: (dataUrl: string) => Promise<string>): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result
      ? resolve(reader.result) : reject(new Error('Could not read the image.'));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onabort = () => reject(new Error('Image reading was cancelled.'));
    reader.readAsDataURL(file);
  });
  return upload(dataUrl);
}
