import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const f = createUploadthing();

// Helper function to get authenticated user
async function getAuthenticatedUser() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new UploadThingError("Unauthorized");
    }

    return session.user;
  } catch (error) {
    console.error("Authentication error:", error);
    throw new UploadThingError("Unauthorized");
  }
}

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f({
    image: {
      /**
       * For full list of options and defaults, see the File Route API reference
       * @see https://docs.uploadthing.com/file-routes#route-config
       */
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    // Set permissions and file types for this FileRoute
    .middleware(async () => {
      // This code runs on your server before upload
      const user = await getAuthenticatedUser();

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Upload complete for userId:", metadata.userId);

      console.log("file url", file.ufsUrl);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId };
    }),

  // Document uploader for txt, doc, docx, and pdf files
  documentUploader: f({
    "text/plain": {
      maxFileSize: "8MB",
      maxFileCount: 5,
    },
    "application/pdf": {
      maxFileSize: "16MB",
      maxFileCount: 5,
    },
    "application/msword": {
      maxFileSize: "16MB",
      maxFileCount: 5,
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "16MB",
      maxFileCount: 5,
    },
  })
    .middleware(async () => {
      // This code runs on your server before upload
      const user = await getAuthenticatedUser();

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Document upload complete for userId:", metadata.userId);
      console.log("Document file url", file.ufsUrl);
      console.log("File name:", file.name);
      console.log("File size:", file.size);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return {
        uploadedBy: metadata.userId,
        fileName: file.name,
        fileSize: file.size,
      };
    }),

  // Combined uploader for both images and documents
  mediaUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 10,
    },
    "text/plain": {
      maxFileSize: "8MB",
      maxFileCount: 10,
    },
    "application/pdf": {
      maxFileSize: "16MB",
      maxFileCount: 10,
    },
    "application/msword": {
      maxFileSize: "16MB",
      maxFileCount: 10,
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "16MB",
      maxFileCount: 10,
    },
  })
    .middleware(async () => {
      // This code runs on your server before upload
      const user = await getAuthenticatedUser();

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Media upload complete for userId:", metadata.userId);
      console.log("File url", file.ufsUrl);
      console.log("File name:", file.name);
      console.log("File size:", file.size);
      console.log("File type:", file.type);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return {
        uploadedBy: metadata.userId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
