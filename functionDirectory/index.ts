import { createDatabaseClient, createSiteContext, errorResponse } from "./_qoder/backend.mjs";
import { createStorageClient } from "./_qoder/storage.mjs";
import { application } from "./app.ts";

const handle = application({ db: createDatabaseClient(), storage: createStorageClient() });

Deno.serve(async (request: Request) => {
  let context: any;
  try {
    context = createSiteContext(request, { forwardApplicationCredentials: true });
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});
