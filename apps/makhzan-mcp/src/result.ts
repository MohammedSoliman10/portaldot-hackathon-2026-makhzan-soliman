/** Every tool returns these two things: the text a model reads, and the same facts as structured data. */
export interface ToolResult {
  text: string;
  facts: Record<string, unknown>;
}
