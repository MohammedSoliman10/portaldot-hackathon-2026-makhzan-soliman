import type { ReactNode } from "react";
import { blockHref } from "../data/blocks";
import { formatCount } from "../data/labels";

/**
 * A recorded block number, opening in the Portaldot node console. There is no EVM explorer on this
 * network, so the hash still points at the evidence file — the block is the thing that has a page.
 */
export function BlockLink({ block }: { block: number | null | undefined }): ReactNode {
  if (block === null || block === undefined) return "not recorded";
  return (
    <a
      className="link-quiet numeral underline"
      href={blockHref(block)}
      target="_blank"
      rel="noreferrer"
      title={`Open block ${formatCount(block)} in the Portaldot node console`}
    >
      {formatCount(block)}
    </a>
  );
}
