import React, { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

// Corrected React.lazy import:
// Import the main package and extract the named 'Prism' export
const LazySyntaxHighlighter = React.lazy(() =>
  import("react-syntax-highlighter").then((module) => {
    // Check if Prism exists on the module, otherwise try default
    // (Though Prism is usually the named export)
    const component = module.Prism || module.default;
    if (!component) {
      // Throw an error if the component cannot be found
      // This helps in debugging if the library structure changes
      throw new Error("SyntaxHighlighter component not found in module");
    }
    return { default: component }; // Return in the format React.lazy expects
  }),
);

interface MessageRendererProps {
  content: string;
}

// Fallback component remains the same
const CodeBlockFallback = ({ children }: { children: React.ReactNode }) => {
  return (
    <pre
      style={{
        backgroundColor: "#282c34",
        color: "#abb2bf",
        padding: "1em",
        // margin: ".5em 0",
        overflow: "auto",
        borderRadius: "5px",
        // marginRight: "5px",
      }}
    >
      <code>{children}</code>
    </pre>
  );
};

const MessageRenderer = ({ content }: MessageRendererProps) => {
  return (
    <div className="md:max-w-[710px] max-w-svw">
      <section>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code(props) {
              const { children, className, node, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");

              return match ? (
                <Suspense
                  fallback={
                    <CodeBlockFallback>{String(children)}</CodeBlockFallback>
                  }
                >
                  {/* Render the lazy component */}
                  <LazySyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    customStyle={{
                      // marginRight: "5px",
                      backgroundColor: "#282c34", // Optional: Helps prevent layout shift
                    }}
                    wrapLongLines={true}
                    wrapLines={true}
                    // PreTag="div" // Uncomment if you encounter nested <pre> issues
                  >
                    {String(children).replace(/\n$/, "")}
                  </LazySyntaxHighlighter>
                </Suspense>
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            },
            // Optional: Style paragraphs for consistency if needed
            // p(props) {
            //   const { node, ...rest } = props;
            //   return <p style={{ marginBottom: '1em' }} {...rest} />;
            // }
          }}
        >
          {content}
        </ReactMarkdown>
      </section>
    </div>
  );
};

export default MessageRenderer;
