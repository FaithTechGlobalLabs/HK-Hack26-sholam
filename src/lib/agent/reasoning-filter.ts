/**
 * Drops DeepSeek-style thinking traces from streamed answer text.
 * Holds back a split "<think>" tag so it cannot leak across chunks.
 */
export function createReasoningFilter() {
  let pending = "";
  let hiding = false;
  let started = false;

  return (chunk: string): string => {
    pending += chunk;
    let visible = "";

    while (pending.length > 0) {
      if (hiding) {
        const end = pending.toLowerCase().indexOf("</think>");
        if (end === -1) {
          pending = pending.slice(-8);
          break;
        }
        pending = pending.slice(end + "</think>".length);
        hiding = false;
        continue;
      }

      const start = pending.toLowerCase().indexOf("<think>");
      if (start === -1) {
        const tail = pending.lastIndexOf("<");
        if (tail !== -1 && pending.length - tail < "<think>".length) {
          visible += pending.slice(0, tail);
          pending = pending.slice(tail);
          break;
        }
        visible += pending;
        pending = "";
        break;
      }

      visible += pending.slice(0, start);
      pending = pending.slice(start + "<think>".length);
      hiding = true;
    }

    if (!started) visible = visible.replace(/^\s+/, "");
    if (visible) started = true;
    return visible;
  };
}
