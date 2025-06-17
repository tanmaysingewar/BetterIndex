// app/routes/settings.tsx
"use client";
import { useState, useEffect } from "react";
import { Command, LogOutIcon, Moon, Sun, UserRound } from "lucide-react"; // Removed unused Database icon
import { Avatar, AvatarFallback } from "./ui/avatar";
import { authClient } from "@/lib/auth-client";
// import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import Image from "next/image";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useUserStore } from "@/store/userStore";
import Cookies from "js-cookie";
import Default from "@/assets/default.png";
import { useTheme } from "next-themes";

// 2. Use the SettingsProps interface and destructure 'user' from it
export default function Settings() {
  // const router = useRouter();
  const [selected, setSelected] = useState("Account");
  const { user, setUser } = useUserStore();
  const [logOutLading, setLogOutLading] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // Placeholder logic: Set example values
    // TODO: Replace this with your actual logic to get these values
    // Maybe fetch from an API, read from Zustand store, or parse from local storage
    const storedRateLimit = localStorage.getItem("userRateLimit"); // Example: assuming this stores the *total* limit like "20"
    if (storedRateLimit) {
      const remainingLimit = parseInt(storedRateLimit, 10);
      if (!isNaN(remainingLimit)) {
      } else {
        console.error(
          "Could not parse totalLimit from localStorage:",
          storedRateLimit
        );
      }
    } else {
      // Set defaults if nothing in local storage
      console.warn(
        "userRateLimit not found in localStorage. Using default values."
      );
    }
  }, []);

  const handleLogout = async () => {
    setLogOutLading(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          setUser(undefined);
          localStorage.clear();
          Cookies.remove("user-status");
          const user = await authClient.signIn.anonymous();
          if (user) {
            setUser(user?.data?.user);
            // SetCookie user-status=guest
            Cookies.set("user-status", "guest", { expires: 7 });
          }
          setLogOutLading(false);
          window.location.replace("/chat?new=true");
          // Close the dialog if onClose is provided
          // return location.reload();
        },
      },
    });
  };

  return (
    <div className=" flex flex-col">
      <div className="p-3 dark:bg-[#1d1e20] rounded-3xl">
        <p className="text-xl font-normal ml-3 mt-3">Settings</p>
        <div className="flex flex-row">
          <div className="mt-5 min-w-44 gap-2 flex flex-col">
            <div
              className={`flex gap-2 text-sm text-left font-light cursor-pointer rounded-xl px-4 py-3 dark:text-neutral-400 ${
                selected === "Account"
                  ? "bg-[#eeeeed] dark:bg-[#28292b] dark:text-white"
                  : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"
              }`}
              onClick={() => setSelected("Account")}
            >
              <UserRound strokeWidth={1.2} className="h-5 w-5" />
              <p className="font-light">Account</p>
            </div>
            {/* <div
                className={`flex gap-2 text-sm text-left font-light cursor-pointer rounded-xl px-4 py-3 text-neutral-400 ${selected === "Appearance" ? "bg-neutral-700 dark:bg-[#28292b] text-white" : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"}`}
                onClick={() => setSelected("Appearance")}
              >
                <Highlighter strokeWidth={1.2} className="h-5 w-5" />
                <p className="font-light">Highlighter</p>
              </div> */}
            {/* <div
                className={`flex gap-2 text-sm text-left font-light hover:bg-neutral-700 dark:hover:bg-[#28292b] cursor-pointer rounded-xl px-4 py-3 text-neutral-400 ${selected === "Data" ? "bg-neutral-700 dark:bg-[#28292b] text-white" : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"}`}
                onClick={() => setSelected("Data")}
              >
                <Database strokeWidth={1.2} className="h-5 w-5 " />
                <p className="font-light">Data</p>
              </div> */}
          </div>
          {selected === "Account" && (
            <div className="mx-5">
              <div className="mt-5 flex flex-row items-center justify-left">
                <Avatar className="w-12 h-12 rounded-full">
                  <Image
                    src={user?.image || Default}
                    alt=""
                    className="w-full h-full rounded-full"
                    width={100}
                    height={100}
                  />
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>

                <div className="ml-3 justify-center">
                  <p className="text-left font-semibold">{user?.name}</p>
                  <p className="text-xs mt-1">{user?.email}</p>
                </div>
              </div>
              <div className="flex flex-col space-y-2 mt-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Theme</p>
                    <p className="text-xs text-muted-foreground">
                      Choose your preferred theme
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Select value={theme} onValueChange={setTheme}>
                      <SelectTrigger className="w-[140px] ml-5">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">
                          <div className="flex items-center space-x-2">
                            <Sun className="h-4 w-4" />
                            <span>Light</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="dark">
                          <div className="flex items-center space-x-2">
                            <Moon className="h-4 w-4" />
                            <span>Dark</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="system">
                          <div className="flex items-center space-x-2">
                            <Command className="h-4 w-4" />
                            <span>System</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="rounded-md p-2 text-left mt-7">
                {/* add the shortcut keys here */}
                <span className="text-black dark:text-white text-xs md:text-[15px] font-semibold">
                  Keyboard Shortcuts:
                </span>
                <div className="gap-2 w-[200px] mt-2">
                  <p className="text-black dark:text-white text-xs md:text-[15px] flex flex-row items-center justify-between ">
                    Search{" "}
                    <span className="text-xs md:text-[15px] flex flex-row items-center">
                      <Command className="w-4 h-4 md:mr-2" /> K
                    </span>
                  </p>
                  <p className="text-black dark:text-white text-xs md:text-[15px] flex flex-row items-center justify-between ">
                    New Chat{" "}
                    <span className="text-xs md:text-[15px] flex flex-row items-center">
                      <Command className="w-4 h-4 md:mr-2" /> + Shift + O
                    </span>
                  </p>
                  <p className="text-black dark:text-white text-xs md:text-[15px] flex flex-row items-center justify-between ">
                    Next Chat{" "}
                    <span className="text-xs md:text-[15px] flex flex-row items-center">
                      <Command className="w-4 h-4 md:mr-2" /> + {"]"}
                    </span>
                  </p>
                  <p className="text-black dark:text-white text-xs md:text-[15px] flex flex-row items-center justify-between ">
                    Previous Chat{" "}
                    <span className="text-xs md:text-[15px] flex flex-row items-center">
                      <Command className="w-4 h-4 md:mr-2" /> + {"["}
                    </span>
                  </p>
                  <p className="text-black dark:text-white text-xs md:text-[15px] flex flex-row items-center justify-between ">
                    Focus{" "}
                    <span className="text-xs md:text-[15px] flex flex-row items-center">
                      <Command className="w-4 h-4 md:mr-2" /> + I
                    </span>
                  </p>
                </div>
              </div>
              <Button
                className="mt-5 w-[100px] cursor-pointer"
                onClick={() => handleLogout()}
                variant={"destructive"}
              >
                {logOutLading ? (
                  <svg
                    fill="#000000"
                    version="1.1"
                    id="Capa_1"
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                    width="900px"
                    height="900px"
                    viewBox="0 0 26.349 26.35"
                    style={{ animation: "spin 1s linear infinite" }}
                  >
                    <style>
                      {`
                                      @keyframes spin {
                                        from {
                                          transform: rotate(0deg);
                                        }
                                        to {
                                          transform: rotate(360deg);
                                        }
                                      }
                                  `}
                    </style>
                    <g>
                      <g>
                        <circle cx="13.792" cy="3.082" r="3.082" />
                        <circle cx="13.792" cy="24.501" r="1.849" />
                        <circle cx="6.219" cy="6.218" r="2.774" />
                        <circle cx="21.365" cy="21.363" r="1.541" />
                        <circle cx="3.082" cy="13.792" r="2.465" />
                        <circle cx="24.501" cy="13.791" r="1.232" />
                        <path d="M4.694,19.84c-0.843,0.843-0.843,2.207,0,3.05c0.842,0.843,2.208,0.843,3.05,0c0.843-0.843,0.843-2.207,0-3.05 C6.902,18.996,5.537,18.988,4.694,19.84z" />
                        <circle cx="21.364" cy="6.218" r="0.924" />
                      </g>
                    </g>
                  </svg>
                ) : (
                  <>
                    <LogOutIcon
                      strokeWidth={1.2}
                      className="h-5 w-5 text-white"
                    />
                    <p className="font-light text-white">Logout</p>
                  </>
                )}
              </Button>
            </div>
          )}
          {selected === "Data" && (
            <div className="space-y-4">
              {/* Row 1: Improve Model */}
              <div className="flex flex-row mx-5 items-center justify-between">
                {/* Left side (Text) - Takes available space */}
                <div className="flex-1 mr-4">
                  <p className="text-sm font-bold">Improve the Model</p>
                  <p className="text-sm mt-2">
                    By allowing your data to be used for training our models,
                    you help enhance your own experience and improve the quality
                    of the model for all users. We take measures to ensure your
                    privacy is protected throughout the process.
                  </p>
                </div>
                {/* Right side (Switch) - Doesn't shrink, content width */}
                <div className="flex-shrink-0 mx-4">
                  <Switch id="airplane-mode" defaultChecked />
                  {/* Checking can be accessed by the checked={true}*/}
                </div>
              </div>

              {/* Row 2: Export Data */}
              <div className="flex flex-row mx-5 items-center justify-between">
                {/* Left side (Text) */}
                <div className="flex-1 mr-4">
                  <p className="text-sm font-bold">Export Account Data</p>
                  <p className="text-sm mt-2">
                    You can download all data associated with your account
                    below. This data includes everything stored in all xAI
                    products.
                  </p>
                </div>
                {/* Right side (Button) */}
                <div className="flex-shrink-0">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-neutral-500"
                  >
                    Export
                  </Button>
                </div>
              </div>

              {/* Row 3: Delete Conversations */}
              <div className="flex flex-row mx-5 items-center justify-between">
                {/* Left side (Text) */}
                <div className="flex-1 mr-4">
                  <p className="text-sm font-bold">Delete All Conversations</p>
                  <p className="text-sm mt-2">
                    Permanently remove all records of your conversations and any
                    associated logs from servers.
                  </p>
                </div>
                {/* Right side (Button) */}
                <div className="flex-shrink-0">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-neutral-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {/* Row 4: Delete Account */}
              <div className="flex flex-row mx-5 items-center justify-between">
                {/* Left side (Text) */}
                <div className="flex-1 mr-4">
                  <p className="text-sm font-bold">Delete Account</p>
                  <p className="text-sm mt-2">
                    Permanently delete your account and associated data from the
                    xAI platform. Deletions are immediate and cannot be undone.
                  </p>
                </div>
                {/* Right side (Button) */}
                <div className="flex-shrink-0">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-red-400 text-red-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
