"use client"
import React, { useState, useRef, useEffect } from 'react'
import InputBox from '@/components/InputArea/InputBox'
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';
import MessageRenderer from '@/components/MessageRenderer'; // Import our new component

interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function chat() {
    const [chatInitiated, setChatInitiated] = useState(false)
    const [input, setInput] = useState<string>("")
    const [isGenerating, setIsGenerating] = useState(false);
    const [showHighlights, setShowHighlights] = useState(true)
    const [messages, setMessages] = useState<Message[]>([
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },
        {
        role: "user",
        content: "Hello!"
    },{
        role: "assistant",
        content: `
## Introduction to AI Assistance
I'm an AI assistant designed to provide clear, concise, and informative responses to your queries, **utilizing markdown for readability**. <under>The primary goal is to deliver accurate and relevant information while ensuring key details are easily identifiable.</under> I can help with a wide range of topics, from general knowledge to specific areas like technology and science, and I will highlight crucial information for better understanding.
        `
    },

])

    // Add a ref for the messages container
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Initial load scroll - no smooth behavior
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" })
    }, [])

    // Scroll to bottom on mount and when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const handleSendMessage = async (message: string) => {
        if (!message.trim() || isGenerating) return;
        setChatInitiated(true)
        setIsGenerating(true);

        try {
            const response = await fetch('/api/gpt4omini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            // Remove loading message if it exists
            setMessages(prev => prev.filter(msg => msg.content !== "loading..."));

            // Add empty assistant message that we'll stream into
            setMessages(prev => [...prev, {
                role: "user",
                content: message
            }, {
                role: "assistant",
                content: ""
            }]);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader available');

            let accumulatedText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log("Stream finished")
                    console.log(accumulatedText)
                    break};

                // Decode the stream and accumulate the text
                const text = new TextDecoder().decode(value);
                accumulatedText += text;

                // Update the last message with the accumulated content
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    lastMessage.content = accumulatedText;
                    return newMessages;
                });
            }
        } catch (error) {
            console.error('Error:', error);
            // Handle error state
            setMessages(prev => {
                const newMessages = prev.slice(0, -1);
                return [...newMessages, {
                    role: "assistant",
                    content: "Sorry, there was an error processing your request."
                }];
            });
        } finally {
            setIsGenerating(false);
            setInput("");
        }
    }

    return (
        <div className='flex flex-col h-screen items-center justify-between'>
            <div className='w-full flex flex-col items-center'>
                <Header />
                <div className='mx-auto text-left'>
                    <div className='max-w-[790px] mx-auto p-4 mt-12 md:mt-0 mr-3'>
                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={`mb-2 ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
                                style={{ minHeight: `${messages.length - 1 === index && chatInitiated ? "calc(-210px + 100vh)" : "auto"}` }}
                            >
                                <div
                                    className={`p-3 rounded-3xl w-fit rounded-br-lg ${message.role === "user"
                                        ? "dark:bg-[#2d2e30] text-white ml-auto max-w-[80%] "
                                        : "bg-transparent dark:text-white mr-auto"
                                        }`}
                                >
                                    {
                                        message.content === "loading..." ?
                                            <Spinner />
                                            :
                                        message.role === "assistant" ? 
                                                <div className="markdown-content">
                                                    {/* Use our new component here */}
                                                    <MessageRenderer
                                                        content={message.content}
                                                        showHighlights={showHighlights}
                                                    />
                                                    {/* {message.content} */}
                                                </div>
                                                :
                                                <p>{message.content}</p>
                                    }
                                </div>
                            </div>
                        ))}
                        <div className='mb-[120px]' ref={messagesEndRef} />
                    </div>
                </div>
            </div>
            <div className='flex flex-col bottom-0 w-full fixed max-w-3xl'>
                <InputBox
                    height={58}
                    input={input}
                    setInput={setInput}
                    onSend={handleSendMessage}
                    disabled={isGenerating}
                    showHighlights={showHighlights}
                    setShowHighlights={setShowHighlights}
                />
            </div>
        </div>
    );
}