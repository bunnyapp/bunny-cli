import BunnyClient from "@bunnyapp/api-client";

const client = function (subdomain, accessToken) {
  let baseUrl = `https://${subdomain}.bunny.com`;

  if (subdomain.startsWith("https")) {
    baseUrl = subdomain;
  }

  return new BunnyClient({
    baseUrl: baseUrl,
    accessToken: accessToken,
  });
};

export default client;
