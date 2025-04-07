"use client";
import { LogOutIcon, SettingsIcon, SquarePen, TextSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
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

  const router = useRouter();
  const { user, fetchAndSetSession, setUser } = useUserStore();

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          setUser(undefined);
          localStorage.clear();
          Cookies.remove("user-status");
          router.push("/");
          return location.reload();
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

  const SignInComponent = () => {
    return (
      <Button
        className="cursor-pointer"
        onClick={async () => {
          Cookies.remove("user-status");
          await authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
          });
        }}
      >
        Sign In
      </Button>
    );
  };

  const closeChatHistory = () => {
    setOpenChatHistoryDialog(false);
    setOpenChatHistoryDrawer(false);
  };

  return (
    <div className="w-full">
      <div
        className={`flex flex-row items-center justify-between w-full max-w-full bg-[#1d1e20] md:bg-transparent shadow-lg shadow-neutral-800 dark:shadow-[#1d1e20] md:shadow-none md:fixed top-0 ${landingPage ? "fixed top-0" : ""
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
                if (location.pathname === "/") {
                  return;
                }
                router.push("/");
              }}
            >
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            <Dialog open={openChatHistoryDialog} onOpenChange={setOpenChatHistoryDialog}>
              <DialogTrigger>
                <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
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
                className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full"
                onClick={() => setOpenSettings(true)}
              >
                <SettingsIcon
                  className="w-[17px] h-[17px] text-white"
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
            <Drawer open={openChatHistoryDrawer} onOpenChange={setOpenChatHistoryDrawer}>
              <DrawerTrigger>
                <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
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
                <DrawerTrigger>
                  <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
                    <SettingsIcon
                      className="w-[17px] h-[17px] text-white"
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
                              src={user?.image || ""}
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
                        <Button
                          className="mt-10"
                          onClick={() => handleLogout()}
                        >
                          <LogOutIcon strokeWidth={1.2} className="h-5 w-5" />
                          <p className="font-light">Logout</p>
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
