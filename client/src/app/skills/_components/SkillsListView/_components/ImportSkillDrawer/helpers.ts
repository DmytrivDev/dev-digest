/**
 * Read a picked file as base64 for `POST /skills/import/preview`.
 *
 * `FileReader.readAsDataURL` gives `data:<mime>;base64,<payload>`; the server
 * strips the prefix, so the whole string is sent as-is rather than sliced here
 * — one place decides what a valid envelope looks like, and it is the one that
 * parses it.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the file."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
