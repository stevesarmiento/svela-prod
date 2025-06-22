"use server";

import { authActionClient } from "@/actions/safe-action";
import { updateUserSchema } from "./schema";

export const updateUserAction = authActionClient
  .schema(updateUserSchema)
  .metadata({
    name: "update-user",
  })
  .action(async ({ parsedInput: input, ctx: { user } }) => {
    // TODO: Replace with Convex user update mutation once fully set up
    console.log("Update user action called with:", input, "for user:", user.id);
    
    // Return a success response for now
    return { success: true };
  });
