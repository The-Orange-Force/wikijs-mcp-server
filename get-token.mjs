import { PublicClientApplication } from "@azure/msal-node";

const TENANT_ID = "b6b64b76-55b5-4467-8a3a-6f4edf7586a7";
const CLIENT_APP_ID = "977a3d27-0efe-4f9c-8ea9-9a9d390dd12d";
const SERVER_APP_CLIENT_ID = "977a3d27-0efe-4f9c-8ea9-9a9d390dd12d";

const config = {
  auth: {
    clientId: CLIENT_APP_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
};

const pca = new PublicClientApplication(config);

const request = {
  scopes: [
    `api://${SERVER_APP_CLIENT_ID}/wikijs:read`,
    `api://${SERVER_APP_CLIENT_ID}/wikijs:write`,
    `api://${SERVER_APP_CLIENT_ID}/wikijs:admin`,
  ],
};

const response = await pca.acquireTokenByDeviceCode({
  ...request,
  deviceCodeCallback: (response) => {
    console.log("\n=== Device Code Flow ===");
    console.log(response.message);
    console.log("========================\n");
  },
});

console.log("\nAccess token:");
console.log(response.accessToken);
