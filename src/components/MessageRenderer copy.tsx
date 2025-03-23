import React from 'react';
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import remarkGfm from "remark-gfm";
import { RoughNotation } from "react-rough-notation";

interface MessageRendererProps {
    content: string;
    showHighlights: boolean;
}

const MessageRenderer = ({ content, showHighlights }: MessageRendererProps) => {
    const cleanedContent = content.replace(/\n\s*\n/g, '\n').trim();

    return (
        <div>
            <section>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        code(props) {
                            const { children, className, node, ...rest } = props
                            const match = /language-(\w+)/.exec(className || '')
                            return match ? (
                                <SyntaxHighlighter
                                    style={dark}
                                    language={match[1]}
                                    customStyle={{
                                        maxWidth: "700px"
                                    }}
                                    wrapLongLines={true}
                                    wrapLines={true}
                                >
                                    {String(children)}
                                </SyntaxHighlighter>
                            ) : (
                                <code {...rest} className={className}>
                                    {children}
                                </code>
                            )
                        },
                        p: ({ children }) => {
                            const text = String(children)
                            const parts = [];
                            const underPattern = /<under>(.*?)<\/under>/g;
                            let lastIndex = 0;
                            let match;

                            while ((match = underPattern.exec(text)) !== null) {
                                if (match.index > lastIndex) {
                                    parts.push(<span key={lastIndex}>{text.substring(lastIndex, match.index)}</span>);
                                }
                                parts.push(
                                    <RoughNotation
                                        key={match.index}
                                        type="underline"
                                        show={showHighlights}
                                        color="#BF77F6"
                                        iterations={1}
                                        strokeWidth={2}
                                        multiline={true}
                                    >
                                        {match[1]}
                                    </RoughNotation>
                                );
                                lastIndex = match.index + match[0].length;
                            }

                            if (lastIndex < text.length) {
                                parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
                            }

                            return <p>{parts.length > 0 ? parts : text}</p>;
                        }
                    }}
                >
                    {cleanedContent}
                </ReactMarkdown>
            </section>
        </div>
    );
};

export default MessageRenderer;