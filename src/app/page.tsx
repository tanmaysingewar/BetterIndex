interface User {
  id: string | undefined;
  name: string | undefined;
  email: string | undefined;
  emailVerified: boolean | undefined;
  image: string | undefined;
  createdAt?: Date | undefined; // Allow undefined or null
  updatedAt?: Date | undefined; // Allow undefined or null
  isAnonymous: boolean;
  isDummy?: boolean;
}

interface Session {
  session: {
    id: string | undefined;
    expiresAt: Date | undefined;
    token: string | undefined;
    createdAt: Date | undefined;
    updatedAt: Date | undefined;
    ipAddress?: string | undefined; // Make optional
    userAgent?: string | undefined; // Make optional
    userId: string | undefined;
  };
  user: User;
}

import MainPage from "@/screens/MainPage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Chat() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    const defaultAnonymousUser: User = {
      id: undefined,
      name: "Anonymous",
      email: undefined,
      emailVerified: false,
      image: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      isAnonymous: true,
      isDummy: true,
    };

    const defaultAnonymousScession = {
      id: undefined,
      expiresAt: undefined,
      token: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      ipAddress: undefined, // Make optional
      userAgent: undefined, // Make optional
      userId: undefined,
    };

    return (
      <MainPage
        session={{
          user: defaultAnonymousUser,
          session: defaultAnonymousScession,
        }}
      />
    );
  }

  return <MainPage session={session as Session} />;
}
