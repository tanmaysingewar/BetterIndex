"use client";
import { LogOutIcon, SettingsIcon, SquarePen, TextSearch } from "lucide-react";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  // DialogDescription,
  // DialogHeader,
  DialogTitle,
  DialogTrigger,
  // DialogClose,
} from "@/components/ui/dialog";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

// import { useAppTheme } from "./theme-provider";

import Settings from "./Setting";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
// import { useRouter } from "next/navigation";

export default function Header({ session }: any) {
  const [openSettings, setOpenSettings] = useState(false);
  // const { resolvedTheme, mounted } = useAppTheme();
  // const [user, setUser] = useState(session);
  // const router = useRouter();

  console.log(session);
  // console.log(user);

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          console.log("Logged out");
        },
      },
    });
  };

  const SignInComponent = () => {
    return (
      <Button
        className="cursor-pointer"
        onClick={async () => {
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

  return (
    <div className="w-full">
      <div className="flex flex-row items-center justify-between w-full top-0 fixed max-w-full bg-[#1d1e20] md:bg-transparent shadow-lg shadow-neutral-800 dark:shadow-[#1d1e20] md:shadow-none">
        <div>
          {/* <h1 className='text-3xl font-bold text-white ml-2'>Logo</h1> */}
        </div>
        <div
          id={"desktop-menu"}
          className="flex flex-row px-4 justify-center items-center"
        >
          <div className="flex-row px-4 pt-2 justify-center items-center hidden md:flex">
            <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            {!session?.isAnonymous && (
              <Dialog>
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
                  <div className="flex flex-col justify-start">
                    <Input
                      placeholder="Search"
                      style={{ fontSize: "16px" }}
                      className="w-full border-0 ring-0 top-0 h-[60px] border-b-2 rounded-none"
                    />
                    <div className="p-4 h-[60vh] overflow-y-auto">
                      <p className="font-light text-[15px] px-3 pb-5">Today</p>
                      <div className="gap-1 flex flex-col">
                        {Array(20)
                          .fill("Hello")
                          .map((item, index) => (
                            <div
                              key={index}
                              className="hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3"
                            >
                              <p className="text-[16px]">{item}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="border-t-2 h-[60px]">
                      <p></p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {!session?.isAnonymous && (
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
            {!session || (session?.isAnonymous && SignInComponent())}
            {/* {!session && SignInComponent()} */}
            {/* <div className='flex-row px-3 justify-center items-center flex'></div> */}
          </div>
          <div
            id={"mobile-menu"}
            className="flex-row pt-2 justify-center items-center flex md:hidden"
          >
            <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            {session && (
              <Drawer>
                <DrawerTrigger>
                  <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
                    <TextSearch
                      className="w-5 h-5 text-white"
                      strokeWidth={2.5}
                    />
                  </div>
                </DrawerTrigger>
                <DrawerContent className="w-full bg-[#1d1e20] rounded-t-2xl max-w-2xl ">
                  {/* <DrawerHeader>
                    <DrawerTitle></DrawerTitle>
                    <DrawerDescription></DrawerDescription>
                  </DrawerHeader> */}
                  <div className="flex flex-col justify-start">
                    <Input
                      placeholder="Search"
                      style={{ fontSize: "16px" }}
                      className="w-full border-0 ring-0 top-0 h-[60px] border-b-2 rounded-none"
                    />
                    <div className="p-4 h-[60vh] overflow-y-auto">
                      <p className="font-light text-[15px] px-3 pb-5">Today</p>
                      <div className="gap-1 flex flex-col">
                        {Array(20)
                          .fill("Hello")
                          .map((item, index) => (
                            <div
                              key={index}
                              className="hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3"
                            >
                              <p className="text-[16px]">{item}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                    {/* <div className="border-t-2 h-[60px]">
                      <p></p>
                    </div> */}
                  </div>
                  {/* <DrawerFooter>
                    <DrawerClose>
                    </DrawerClose>
                  </DrawerFooter> */}
                </DrawerContent>
              </Drawer>
            )}
            {!session && SignInComponent()}
            {session && (
              <Drawer>
                <DrawerTrigger>
                  <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
                    <SettingsIcon
                      className="w-[17px] h-[17px] text-white"
                      strokeWidth={2.5}
                    />
                  </div>
                </DrawerTrigger>
                <DrawerContent className="w-full bg-[#1d1e20] rounded-t-2xl max-w-2xl ">
                  <DrawerHeader>
                    <DrawerTitle>Are you absolutely sure?</DrawerTitle>
                    <DrawerDescription>
                      This action cannot be undone.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="flex justify-center items-center flex-col">
                    <div className="mt-5 flex flex-row items-center mx-5 justify-center">
                      <Avatar className="w-12 h-12 rounded-full">
                        <Image
                          src={session?.image || ""}
                          alt=""
                          className="w-full h-full rounded-full"
                          width={100}
                          height={100}
                        />
                        <AvatarFallback>CN</AvatarFallback>
                      </Avatar>

                      <div className="ml-3 justify-center">
                        <p className="text-left">{session?.name}</p>
                        <p className="text-xs mt-1">{session?.email}</p>
                      </div>
                    </div>
                    <Button className="mt-10" onClick={() => handleLogout()}>
                      <LogOutIcon strokeWidth={1.2} className="h-5 w-5" />
                      <p className="font-light">Logout</p>
                    </Button>
                  </div>
                  <DrawerFooter>
                    {/* <Button>Submit</Button> */}
                    <DrawerClose>
                      {/* <Button variant="outline">Cancel</Button> */}
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            )}
          </div>

          {session && (
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogContent className="bg-[#1d1e20] h-[60vh] w-[53vw]">
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <Settings user={session} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
