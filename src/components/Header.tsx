"use client";
import { LogOutIcon, SettingsIcon, SquarePen, TextSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  // DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Cookies from "js-cookie";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
import ChatHistory from "./ChatHistory";
import { Switch } from "./ui/switch";
import { useUserStore } from "@/store/userStore";
import Settings from "./Setting";

import Default from "@/assets/default.png";
// import Spinner from "./Spinner";

interface HeaderInterface {
  landingPage: boolean | undefined;
  isNewUser: boolean;
  isAnonymous: boolean;
}

export default function Header({
  landingPage,
  isNewUser,
  isAnonymous,
}: HeaderInterface) {
  const [openSettings, setOpenSettings] = useState(false);
  const [openChatHistoryDialog, setOpenChatHistoryDialog] = useState(false);
  const [openChatHistoryDrawer, setOpenChatHistoryDrawer] = useState(false);
  const [signLading, setSignLading] = useState(false);
  const [logOutLading, setLogOutLading] = useState(false);

  const router = useRouter();
  const { user, fetchAndSetSession, setUser } = useUserStore();

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
          router.push("/chat?new=true");
          // return location.reload();
        },
      },
    });
  };

  useEffect(() => {
    const setUser = async () => {
      await fetchAndSetSession();
    };

    setUser();
  }, [fetchAndSetSession]);

  // Added state for current usage and total limit
  const [currentUsage, setCurrentUsage] = useState<number | null>(null);
  const [totalLimit, setTotalLimit] = useState<number | null>(null);

  useEffect(() => {
    // Placeholder logic: Set example values
    // TODO: Replace this with your actual logic to get these values
    // Maybe fetch from an API, read from Zustand store, or parse from local storage
    const storedRateLimit = localStorage.getItem("userRateLimit"); // Example: assuming this stores the *total* limit like "20"
    if (storedRateLimit) {
      const remainingLimit = parseInt(storedRateLimit, 10);
      if (!isNaN(remainingLimit)) {
        setTotalLimit(10);
        // --- HOW DO YOU GET THE CURRENT USAGE? ---
        // Example: Set a static value for now
        setCurrentUsage(10 - remainingLimit);
      } else {
        console.error(
          "Could not parse totalLimit from localStorage:",
          storedRateLimit
        );
        // Set defaults if parsing fails
        setTotalLimit(10);
        setCurrentUsage(0);
      }
    } else {
      // Set defaults if nothing in local storage
      console.warn(
        "userRateLimit not found in localStorage. Using default values."
      );
      setTotalLimit(10);
      setCurrentUsage(0);
    }
  }, []);

  // Calculate derived values for the progress bar and remaining messages
  const remainingMessages =
    totalLimit !== null && currentUsage !== null
      ? totalLimit - currentUsage
      : null;
  const progressPercentage =
    totalLimit !== null && currentUsage !== null && totalLimit > 0
      ? (currentUsage / totalLimit) * 100
      : 0;

  const SignInComponent = () => {
    return (
      <Button
        className="cursor-pointer w-[70px]"
        onClick={async () => {
          setSignLading(true);
          Cookies.remove("user-status");
          await authClient.signIn.social({
            provider: "google",
            callbackURL: "/chat?new=true",
          });
        }}
        disabled={signLading}
      >
        {signLading ? (
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
          "Sign In"
        )}
      </Button>
    );
  };

  const closeChatHistory = () => {
    setOpenChatHistoryDialog(false);
    setOpenChatHistoryDrawer(false);
  };

  return (
    <div className="w-full block lg:hidden">
      <div
        className={`flex flex-row items-center justify-between w-full max-w-full bg-[#1d1e20] md:bg-transparent shadow-lg shadow-neutral-800 dark:shadow-[#1d1e20] md:shadow-none md:fixed top-0 ${
          landingPage ? "fixed top-0" : ""
        }`}
      >
        <div>
          {/* <h1 className='text-3xl font-bold text-white ml-2'>Logo</h1> */}
        </div>
        <div
          id={"desktop-menu"}
          className="flex flex-row px-4 justify-center items-center"
        >
          <div className="flex-row px-4 pt-2 justify-center items-center hidden md:flex">
            <div
              className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full"
              onClick={() => {
                if (location.href.includes("/chat?new=true")) {
                  return;
                }
                router.push("/chat?new=true");
              }}
            >
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            <Dialog
              open={openChatHistoryDialog}
              onOpenChange={setOpenChatHistoryDialog}
            >
              <DialogTrigger className="outline-none">
                <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full outline-none">
                  <TextSearch
                    className="w-5 h-5 text-white"
                    strokeWidth={2.5}
                  />
                </div>
              </DialogTrigger>
              <DialogContent className="bg-[#1d1e20] rounded-lg  w-[53vw]">
                <DialogTitle className="sr-only"></DialogTitle>
                <ChatHistory max_chats={10} onClose={closeChatHistory} />
              </DialogContent>
            </Dialog>
            {!isAnonymous && !isNewUser && (
              <button
                className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full outline-none"
                onClick={() => setOpenSettings(true)}
              >
                <SettingsIcon
                  className="w-[17px] h-[17px] text-white outline-none"
                  strokeWidth={2.5}
                />
              </button>
            )}

            {isAnonymous && SignInComponent()}
            {isNewUser && SignInComponent()}
          </div>
          <div
            id={"mobile-menu"}
            className="flex-row pt-2 justify-center items-center flex md:hidden"
          >
            <div
              className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full"
              onClick={() => {
                if (location.pathname === "/") {
                  return;
                }
                router.push("/");
              }}
            >
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            <Drawer
              open={openChatHistoryDrawer}
              onOpenChange={setOpenChatHistoryDrawer}
            >
              <DrawerTrigger className="outline-none">
                <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full outline-none">
                  <TextSearch
                    className="w-5 h-5 text-white"
                    strokeWidth={2.5}
                  />
                </div>
              </DrawerTrigger>
              <DrawerContent className="w-full bg-[#1d1e20] rounded-t-2xl max-w-2xl ">
                <ChatHistory max_chats={7} onClose={closeChatHistory} />
              </DrawerContent>
            </Drawer>

            {isAnonymous && SignInComponent()}
            {!isAnonymous && (
              <Drawer>
                <DrawerTrigger className="outline-none">
                  <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full outline-none">
                    <SettingsIcon
                      className="w-[17px] h-[17px] text-white outline-none"
                      strokeWidth={2.5}
                    />
                  </div>
                </DrawerTrigger>
                <DrawerContent className="w-full bg-[#1d1e20] rounded-t-2xl max-w-2xl">
                  <Tabs defaultValue="account" className="mt-5 min-h-[560px]">
                    <TabsList className="w-[90%] mx-auto mb-3">
                      <TabsTrigger value="account">Account</TabsTrigger>
                    </TabsList>
                    <TabsContent value="account">
                      <div className="flex justify-center items-center flex-col">
                        <div className="mt-5 flex flex-row items-center mx-5 justify-center">
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
                            <p className="text-left">{user?.name}</p>
                            <p className="text-xs mt-1">{user?.email}</p>
                          </div>
                        </div>
                        {/* Rate Limit Section - Replaced */}
                        <div className="mt-5 w-full max-w-xs">
                          {" "}
                          {/* Added max-width for better control */}
                          {currentUsage !== null && totalLimit !== null ? (
                            <>
                              <div className="flex justify-between items-center mb-1 text-sm">
                                <span className="font-medium text-white">
                                  Standard
                                </span>{" "}
                                {/* Label */}
                                <span className="font-medium text-gray-400">{`${currentUsage}/${totalLimit}`}</span>{" "}
                                {/* Usage/Total */}
                              </div>
                              <div className="w-full bg-neutral-600 rounded-full h-1.5 dark:bg-gray-700">
                                {" "}
                                {/* Progress bar container */}
                                <div
                                  className="bg-white h-1.5 rounded-full" // Progress bar fill (pink)
                                  style={{ width: `${progressPercentage}%` }}
                                ></div>
                              </div>
                              {remainingMessages !== null && (
                                <p className="text-xs text-gray-400 mt-1">
                                  {`${remainingMessages} message${
                                    remainingMessages !== 1 ? "s" : ""
                                  } remaining`}{" "}
                                  {/* Remaining text */}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-gray-400">
                              Loading rate limit...
                            </p> // Loading state
                          )}
                        </div>
                        <Button
                          className="mt-10 w-[100px] cursor-pointer outline-none"
                          onClick={() => handleLogout()}
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
                                className="h-5 w-5 outline-none"
                              />
                              <p className="font-light">Logout</p>
                            </>
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="data">
                      <div className="space-y-4">
                        <div className="flex flex-row mx-5 items-center justify-between">
                          <div className="flex-1 mr-4">
                            <p className="text-sm font-bold">
                              Improve the Model
                            </p>
                            <p className="text-sm mt-2">
                              By allowing your data to be used for training our
                              models, you help enhance your own experience and
                              improve the quality of the model for all users. We
                              take measures to ensure your privacy is protected
                              throughout the process.
                            </p>
                          </div>
                          <div className="flex-shrink-0 mx-4">
                            <Switch id="airplane-mode" defaultChecked />
                          </div>
                        </div>

                        <div className="flex flex-row mx-5 items-center justify-between">
                          <div className="flex-1 mr-4">
                            <p className="text-sm font-bold">
                              Export Account Data
                            </p>
                            <p className="text-sm mt-2">
                              You can download all data associated with your
                              account below. This data includes everything
                              stored in all xAI products.
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <Button
                              variant="secondary"
                              className="rounded-4xl border border-neutral-500"
                            >
                              Export
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-row mx-5 items-center justify-between">
                          <div className="flex-1 mr-4">
                            <p className="text-sm font-bold">
                              Delete All Conversations
                            </p>
                            <p className="text-sm mt-2">
                              Permanently remove all records of your
                              conversations and any associated logs from
                              servers.
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <Button
                              variant="secondary"
                              className="rounded-4xl border border-neutral-400"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-row mx-5 items-center justify-between">
                          <div className="flex-1 mr-4">
                            <p className="text-sm font-bold">Delete Account</p>
                            <p className="text-sm mt-2">
                              Permanently delete your account and associated
                              data from the xAI platform. Deletions are
                              immediate and cannot be undone.
                            </p>
                          </div>
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
                    </TabsContent>
                  </Tabs>
                  {/* <DrawerFooter>
                    <Button>Submit</Button>
                    <DrawerClose>
                      <Button variant="outline">Cancel</Button>
                    </DrawerClose>
                  </DrawerFooter> */}
                </DrawerContent>
              </Drawer>
            )}
          </div>

          {!isAnonymous && (
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogContent className="bg-[#1d1e20] h-[60vh] w-[53vw]">
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <Settings />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
