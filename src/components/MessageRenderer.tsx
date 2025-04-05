import { Check, CopyIcon } from "lucide-react";
import React, { Suspense, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

// Lazy load the syntax highlighter
const LazySyntaxHighlighter = React.lazy(() =>
  import("react-syntax-highlighter").then((module) => {
    const component = module.Prism || module.default;
    if (!component) {
      throw new Error("SyntaxHighlighter component not found in module");
    }
    return { default: component };
  }),
);

interface MessageRendererProps {
  content: string;
}

// --- Updated Fallback component for code blocks ---
const CodeBlockFallback = ({
  children,
  language,
}: {
  children: React.ReactNode;
  language: string | null;
}) => {
  return (
    <div
      style={{
        backgroundColor: "#282c34", // Matches oneDark background
        borderRadius: "5px",
        overflow: "hidden", // Ensures children don't overflow rounded corners
      }}
    >
      {/* Header for Fallback */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5em 1em",
          backgroundColor: "#3a404a", // Slightly lighter header background
          color: "#abb2bf",
          fontSize: "0.85em",
        }}
      >
        <span>{language || "code"}</span>
        {/* You might want a disabled-looking button here */}
        <button
          disabled
          className="bg-neutral-700 text-white border-none rounded-sm px-2 py-1 cursor-not-allowed opacity-50"
          aria-label="Copy code (loading)"
        >
          <CopyIcon size={16} />
        </button>
      </div>
      {/* Code Area for Fallback */}
      <pre
        style={{
          backgroundColor: "#282c34",
          color: "#abb2bf",
          padding: "1em",
          margin: 0, // Remove default pre margin
          overflow: "auto",
          // No border radius here, handled by parent div
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
};

// Copy button component (no changes needed from previous version)
const CopyButton = ({ text }: { text: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    if (isCopied) {
      timeoutId = setTimeout(() => {
        setIsCopied(false);
      }, 1000);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isCopied]);

  return (
    <button
      onClick={handleCopy}
      disabled={isCopied}
      // Adjusted styling: remove absolute positioning, maybe add slight margin
      className={`bg-transparent text-white border-none rounded-sm px-2 py-1 cursor-pointer text-sm transition-opacity duration-200 ${
        isCopied ? "opacity-60 cursor-default" : "hover:opacity-70" // Added active state
      }`}
      aria-label={isCopied ? "Copied!" : "Copy code"}
    >
      {isCopied ? <Check size={16} /> : <CopyIcon size={16} />}
      {/* Slightly smaller icon for the header */}
    </button>
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
              const codeText = String(children).replace(/\n$/, "");
              const language = match ? match[1] : null;

              return match ? (
                // Container retains relative positioning if needed elsewhere,
                // but CopyButton is no longer absolutely positioned within it.
                <div
                  style={{
                    position: "relative",
                    marginBottom: "1em", // Add space below code blocks
                  }}
                >
                  <Suspense
                    fallback={
                      <CodeBlockFallback language={language}>
                        {codeText}
                      </CodeBlockFallback>
                    }
                  >
                    {/* Wrapper div for header + code block */}
                    <div
                      style={{
                        backgroundColor: "#282c34", // Matches oneDark background
                        borderRadius: "5px",
                        overflow: "hidden", // Clip children to rounded corners
                      }}
                    >
                      {/* Header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.5em 1em", // Adjust padding as needed
                          backgroundColor: "#3a404a", // Slightly lighter header
                          color: "#d1d5db", // Lighter text for header
                          fontSize: "0.85em", // Smaller font for language
                        }}
                      >
                        {/* Language Name */}
                        <span>{language}</span>

                        {/* Copy Button - Now inside the header */}
                        <CopyButton text={codeText} />
                      </div>

                      {/* Syntax Highlighter */}
                      <LazySyntaxHighlighter
                        // Add the scrollbar utility classes here
                        className="[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-[5px] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500"
                        style={vscDarkPlus}
                        language={language || "text"} // Provide a fallback language
                        customStyle={{
                          // Your existing styles
                          borderBottomLeftRadius: "5px",
                          borderBottomRightRadius: "5px",
                          borderTopLeftRadius: "0",
                          borderTopRightRadius: "0",
                          backgroundColor: "#282c34",
                          padding: "1em",
                          margin: 0, // Remove default margin

                          // Add overflow and height/maxHeight to enable scrolling
                          overflow: "auto", // Or 'scroll'
                          // maxHeight: "500px", // Adjust this value as needed
                          // Or use a fixed height: height: "500px",
                        }}
                        wrapLongLines={true}
                        wrapLines={true}
                      >
                        {codeText}
                      </LazySyntaxHighlighter>
                    </div>
                  </Suspense>
                </div>
              ) : (
                // Inline code styling
                <code
                  {...rest}
                  className={`${className} bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-sm font-mono`}
                >
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
