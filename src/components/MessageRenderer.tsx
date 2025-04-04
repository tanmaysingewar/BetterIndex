import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MessageRendererProps {
  content: string;
  showHighlights: boolean;
}

const MessageRenderer = ({ content, showHighlights }: MessageRendererProps) => {
  return (
    <div className="md:max-w-[710px] max-w-svw">
      <section>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code(props) {
              const { children, className, node, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              console.log(match);
              return match ? (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  customStyle={{
                    marginRight: "5px",
                  }}
                  wrapLongLines={true}
                  // showLineNumbers={true}
                  // showInlineLineNumbers={true}
                  wrapLines={true}
                >
                  {String(children)}
                </SyntaxHighlighter>
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </section>
    </div>
  );
};

export default MessageRenderer;
