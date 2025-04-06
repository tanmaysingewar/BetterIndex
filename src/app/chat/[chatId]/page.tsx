"use server";
import ChatInterface from "@/screens/ChatInterface";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  image?: string | null | undefined;
  isAnonymous?: boolean | null | undefined;
}

interface SessionDetailsInterface {
  user: User | null; // Allow user to be null
}

export default async function LandingPage() {
  const head = await headers();

  if (head.get("cookie")?.includes("user-status=user")) {
    console.log("SIGNIN USER");
    return (
      <ChatInterface
        sessionDetails={{ user: null } as SessionDetailsInterface}
        isNewUser={false}
        isAnonymous={false}
      />
    );
  }

  if (head.get("cookie")?.includes("user-status=guest")) {
    console.log("GUEST");
    return (
      <ChatInterface
        sessionDetails={{ user: null } as SessionDetailsInterface}
        isNewUser={false}
        isAnonymous={true}
      />
    );
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <ChatInterface
        sessionDetails={{ user: null } as SessionDetailsInterface}
        isNewUser={true}
        isAnonymous={false}
      />
    );
  }

  if (session.user.isAnonymous) {
    return (
      <ChatInterface
        sessionDetails={{ user: session?.user } as SessionDetailsInterface}
        isNewUser={false}
        isAnonymous={true}
      />
    );
  }

  return (
    <ChatInterface
      sessionDetails={{ user: session?.user } as SessionDetailsInterface}
      isNewUser={false}
      isAnonymous={false}
    />
  );
}
