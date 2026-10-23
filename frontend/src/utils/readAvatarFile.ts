/** readAsDataURL must complete with a string, never a coerced ArrayBuffer or null. */
export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const source = reader.result;
      if (typeof source === 'string') resolve(source);
      else reject(new Error('Unable to read image'));
    };
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}
