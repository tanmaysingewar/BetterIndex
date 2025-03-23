import React from 'react';
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import remarkGfm from "remark-gfm";

interface MessageRendererProps {
    content: string;
    showHighlights: boolean;
}

const MessageRenderer = ({ content, showHighlights }: MessageRendererProps) => {

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
                        }}}>
                    {content}
                </ReactMarkdown>
            </section>
        </div>
    );
};

export default MessageRenderer;