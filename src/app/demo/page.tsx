import React from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageRendererProps {
    content: string;
    showHighlights: boolean;
}

const MessageRenderer = () => {

    const content = `
   ## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
`;
    const cleanedContent = content.replace(/\n\s*\n/g, '\n').trim();

    return (
        <div className="markdown-content">
            <section className="markdown-content">
                <ReactMarkdown
                    // remarkPlugins={[remarkGfm]}
                    components={{
                        p: ({ children }) => <p style={{ margin: 0 }}>{children}</p> // Removes extra margin
                    }}
                >
                    {cleanedContent}
                </ReactMarkdown>
            </section>
        </div>
    );
};

export default MessageRenderer;