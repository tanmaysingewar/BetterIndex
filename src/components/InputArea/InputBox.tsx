"use client";
import React, { useState, useEffect, useCallback, KeyboardEvent } from 'react';
import { OctagonPause, Send } from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";

interface InputBoxProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (message: string) => void;
  height: number;
  disabled?: boolean;
}

export default function InputBox({
  input,
  setInput,
  onSend,
  height,
  disabled,
}: InputBoxProps) {
  // Suggestion filtering and navigation state
  const filteredSuggestions = input.split(" ").slice(-1)[0].includes("@")
    ? popularToolsAndFrameworks
      .filter(tool =>
        tool.toLowerCase().includes(
          input
            .split(" ")
            .slice(-1)[0]
            .trim()
            .replace("@", "")
            .toLowerCase()
        )
      )
      .slice(0, 5)
    : [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const handleSelection = useCallback(
    (selection: string) => {
      const tokens = input.split(" ");
      tokens[tokens.length - 1] = "@" + selection + " ";
      setInput(tokens.join(" "));
    },
    [input, setInput]
  );
  // This function is now handled in TextInput component
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLParagraphElement>, selection: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelection(selection);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
      }
    },
    [handleSelection, filteredSuggestions.length]
  );
  useEffect(() => {
    // Only reset selection index when the actual list of suggestions changes
    // We'll compare the current input's last token to determine if suggestions changed
    setSelectedIndex(0);
  }, [input.split(" ").slice(-1)[0]]);

  return (
    <div>
      <div className="max-w-3xl mx-auto text-base font-sans lg:px-0 w-screen md:rounded-t-3xl px-2 fixed bottom-0 left-1/2 transform -translate-x-1/2 ">
        {filteredSuggestions.length > 0 && (
          <div className="mx-5">
            <div className="bg-[#303335]/20 backdrop-blur-xs rounded-t-md p-2">
              {filteredSuggestions.map((match, index) => (
                <p
                  key={index}
                  className={`mb-1 cursor-pointer rounded-sm p-1 ${index === selectedIndex ? 'bg-white/20' : ''}`}
                  onClick={() => handleSelection(match)}
                  onKeyDown={e => handleKeyDown(e, match)}
                  tabIndex={0}
                >
                  <span className="text-white rounded-md px-2 py-1">
                    {match}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col items-center rounded-t-3xl dark:bg-[#303335]/80 bg-neutral-100 p-2 w-full backdrop-blur-xs">
          <TextInput
            input={input}
            setInput={setInput}
            height={height}
            onSend={onSend}
            filteredSuggestions={filteredSuggestions}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            handleSelection={handleSelection}
          />
          <div className="flex flex-row justify-between w-full mt-0">
            <div className="flex flex-row mt-2 text-neutral-200">
              <p className="text-sm mx-3">Llama 3.3 70b Specdec</p>
            </div>
            <div className="flex flex-row justify-center items-center">
              <p className="text-xs dark:text-neutral-400 mr-3 hidden sm:block">
                Use{" "}
                <span className="dark:text-white text-black">
                  shift + return
                </span>{" "}
                for new line
              </p>
              <Button
                className="p-2 h-[38px] w-[38px] rounded-full dark:bg-neutral-200 bg-neutral-800"
                onClick={() => onSend(input)}
                disabled={disabled}
              >
                {!disabled ? <Send /> : <OctagonPause />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const popularToolsAndFrameworks: string[] = [
  "Next.js",
  "ReactJS",
  "Angular",
  "Vue.js",
  "Node.js",
  "Express.js",
  "Django",
  "Flask",
  "RubyOnRails",
  "SpringBoot",
  "ASP.NET Core",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Ansible",
  "AWS",
  "Azure",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "Redis",
  "GraphQL",
  "REST API",
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "C#",
  "Go",
  "Swift",
  "Kotlin",
  "Modal.com", // Added Modal.com
  "BetterAuth", // Added BetterAuth
  "Git",
  "GitHub",
  "GitLab",
  "Jira",
  "Confluence",
  "Slack",
  "Figma",
  "Adobe XD",
  "Webpack",
  "Rollup",
  "Babel",
  "ESLint",
  "Prettier",
  "Jest",
  "Mocha",
  "Cypress",
  "Selenium",
  "Jenkins",
  "CircleCI",
  "Prometheus",
  "Grafana",
  "Datadog",
];
