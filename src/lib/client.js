import BunnyClient from "@bunnyapp/api-client";

const client = function (baseUrl, clientId, clientSecret) {
  return new BunnyClient({
    baseUrl: baseUrl,
    clientId: clientId,
    clientSecret: clientSecret,
    scope:
      "standard:read standard:write admin:read admin:write product:read product:write billing:read billing:write",
  });
};

export default client;
