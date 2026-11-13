import type { AttachedFile } from "../types";

export async function readAttachedFiles(files: FileList | null): Promise<AttachedFile[]> {
  if (!files || files.length === 0) return [];
  const newFiles: AttachedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || !(file instanceof File)) continue;

    const fileName = file.name || 'unnamed-file';
    const fileSize = file.size || 0;
    const fileType = file.type || '';

    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');
    const isPdf = fileName.toLowerCase().endsWith('.pdf') || fileType.includes('pdf');
    const isDocx = fileName.toLowerCase().endsWith('.docx') || fileType.includes('wordprocessingml');
    const isBinaryFormatted = isPdf || isDocx;
    const isMedia = isImage || isVideo;
    const limit = (isMedia || isBinaryFormatted) ? 10 * 1024 * 1024 : 2 * 1024 * 1024;

    if (fileSize > limit) {
      alert(`File "${fileName}" exceeds the ${(isMedia || isBinaryFormatted) ? '10MB' : '2MB'} limit.`);
      continue;
    }

    try {
      if (isMedia || isBinaryFormatted) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        newFiles.push({ name: fileName, content: base64, type: isPdf ? 'application/pdf' : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : fileType });
      } else {
        const rawText = await file.text();
        if (typeof rawText !== 'string' || rawText.includes("\0")) {
          alert(`File "${fileName}" is not a valid text-based file.`);
          continue;
        }
        newFiles.push({ name: fileName, content: rawText.slice(0, 200000), type: fileType || 'text/plain' });
      }
    } catch {
      alert(`Unable to read file "${fileName}".`);
    }
  }
  return newFiles;
}
