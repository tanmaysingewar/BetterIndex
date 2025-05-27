import { Check, CopyIcon } from "lucide-react";
import { Alike } from "next/font/google";
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

const alike = Alike({
  subsets: ["latin"],
  weight: ["400"],
});

interface MessageRendererProps {
  content: string;
}

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
  // const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`md:max-w-[710px] max-w-svw ${alike.className}`}>
      <section>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2(props) {
              return (
                <p {...props} className={`mb-4 mt-6 text-left font- text-3xl`}>
                  {props.children}
                </p>
              );
            },
            img(props) {
              const { src, alt, ...rest } = props;
              return (
                <img
                  {...rest}
                  src={src}
                  alt={alt || ""}
                  className="float-left mr-4 mb-2 max-w-[300px] max-h-[200px] md:max-w-[400px] md:max-h-[300px] object-cover rounded-sm shadow-lg"
                  style={{
                    shapeOutside: "margin-box",
                  }}
                />
              );
            },
            code(props) {
              const { children, className, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              const codeText = String(children).replace(/\n$/, "");
              const language = match ? match[1] : null;
              return match ? (
                <div
                  style={{
                    position: "relative",
                    marginBottom: "1em", // Add space below code blocks
                    clear: "both", // Clear any floating images before code blocks
                  }}
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
                    <SyntaxHighlighter
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
                    </SyntaxHighlighter>
                  </div>
                </div>
              ) : (
                <code
                  {...rest}
                  className={`${className} bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-sm font-firaCode`}
                >
                  {children}
                </code>
              );
            },
            p(props) {
              return (
                <p {...props} className="mb-4 leading-relaxed text-justify">
                  {props.children}
                </p>
              );
            },
            // Add a clearfix div after certain elements to ensure proper layout
            hr(props) {
              return (
                <>
                  <div style={{ clear: "both" }} />
                  <hr
                    {...props}
                    className="my-6 border-gray-300 dark:border-gray-600"
                  />
                </>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
        {/* Clear any floating elements at the end */}
        <div style={{ clear: "both" }} />
      </section>
    </div>
  );
};

export default MessageRenderer;
