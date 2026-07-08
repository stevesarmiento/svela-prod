const domains = [
  process.env.CLERK_FRONTEND_API_URL,
  // Allow a second Clerk issuer (e.g. production Clerk while this deployment
  // is also used by local dev against the development Clerk instance).
  process.env.CLERK_FRONTEND_API_URL_PROD,
].filter((domain): domain is string => Boolean(domain));

export default {
  providers: domains.map((domain) => ({
    domain,
    applicationID: "convex",
  })),
};

