import type { ReactNode } from "react";
import type { Block, Inline } from "../../../../../docs/legal/published/markdown";

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "br":
        return <br key={i} />;
      case "strong":
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "code":
        return <code key={i}>{node.value}</code>;
      case "mark":
        // A value that is still "To be confirmed": highlighted, never silent.
        return (
          <mark key={i} className="legal-tbc" data-testid="legal-tbc">
            {renderInline(node.children)}
          </mark>
        );
      case "link": {
        const external = /^https?:/.test(node.href);
        return (
          <a
            key={i}
            href={node.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}

/**
 * One block of the published markdown. The page already shows the document
 * title as its `h1`, so the markdown's own headings start at `h2`.
 */
export function LegalBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${Math.min(Math.max(block.level, 2), 4)}`) as "h2" | "h3" | "h4";
      return <Tag id={block.id}>{renderInline(block.inline)}</Tag>;
    }
    case "paragraph":
      return <p>{renderInline(block.inline)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="legal-table-wrap">
          <table className="legal-table legal-md-table">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return <blockquote className="legal-quote">{renderInline(block.inline)}</blockquote>;
    case "rule":
      return <hr className="legal-rule" />;
  }
}

export function LegalMarkdown({ blocks }: { blocks: Block[] }) {
  return (
    <div className="legal-md">
      {blocks.map((block, i) => (
        <LegalBlock key={i} block={block} />
      ))}
    </div>
  );
}
