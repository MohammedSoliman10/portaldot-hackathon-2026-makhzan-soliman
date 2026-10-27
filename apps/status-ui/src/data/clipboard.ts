/**
 * Copies text, with a fallback for browsers that have no async clipboard (and for a page served over
 * plain HTTP, where `navigator.clipboard` is missing).
 */
export async function copyText(
  text: string,
  options: { nav?: Navigator; doc?: Document } = {},
): Promise<boolean> {
  const nav = options.nav ?? navigator;
  const doc = options.doc ?? document;

  const clipboard = nav.clipboard;
  if (clipboard !== undefined && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the textarea path
    }
  }

  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  area.select();
  try {
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    doc.body.removeChild(area);
  }
}
