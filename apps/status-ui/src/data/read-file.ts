/**
 * Reads a dropped or chosen file into bytes.
 *
 * `Blob.arrayBuffer()` is the modern path; `FileReader` covers environments that do not ship it
 * (jsdom, older browsers) so the same code path is exercised by the tests.
 */
export function readFileBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });
}
