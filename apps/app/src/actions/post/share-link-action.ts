"use server";

import { authActionClient } from "@/actions/safe-action";
import { shareLinkSchema } from "./schema";

export const shareLinkAction = authActionClient
  .schema(shareLinkSchema)
  .metadata({
    name: "share-link",
  })
  .action(async ({ parsedInput: { postId, baseUrl } }) => {
    // Dynamically import dub to avoid build-time serialization issues
    const { dub } = await import("@/lib/dub");
    
    const link = await dub.links.create({
      url: `${baseUrl}/post/${postId}`,
    });

    return link?.shortLink;
  });
