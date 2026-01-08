import chalk from "chalk";

const mutation = `mutation accountCreate ($attributes: AccountAttributes!) {
  accountCreate (attributes: $attributes) {
      account {
        id
        code
        name
      }
      errors
  }
}`;

const accountImport = async (client, data, options, progressCallback) => {
  // Handle both single account and array of accounts
  const accounts = data.accounts || (Array.isArray(data) ? data : [data]);
  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const accountData of accounts) {
    try {
      // Extract attributes from the account data structure
      const attributes = accountData.attributes || accountData;

      const res = await client.query(mutation, { attributes });

      // Log full response if verbose or if there's an error
      if (options?.verbose || res?.errors || !res?.data?.accountCreate) {
        console.log(
          chalk.gray("\nAPI Response:"),
          JSON.stringify(res, null, 2)
        );
      }

      if (res?.errors) {
        const errorMessages = res.errors
          .map((e) => e.message || JSON.stringify(e))
          .join(", ");
        const errorMsg = `GraphQL errors: ${errorMessages}`;
        errorCount++;
        results.push({
          success: false,
          error: errorMsg,
          accountName: attributes.name || attributes.code || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, accounts.length);
        continue;
      }

      const accountCreate = res?.data?.accountCreate;
      if (!accountCreate) {
        const errorMsg = "Invalid response from server - no accountCreate data";
        errorCount++;
        results.push({
          success: false,
          error: errorMsg,
          accountName: attributes.name || attributes.code || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, accounts.length);
        continue;
      }

      if (accountCreate?.errors) {
        let errorMsg;
        if (Array.isArray(accountCreate.errors)) {
          errorMsg = accountCreate.errors.join(", ");
        } else {
          errorMsg = accountCreate.errors;
        }
        const fullErrorMsg = `Import errors: ${errorMsg}`;
        errorCount++;
        results.push({
          success: false,
          error: fullErrorMsg,
          accountName: attributes.name || attributes.code || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, accounts.length);
        continue;
      }

      successCount++;
      results.push({ success: true, account: accountCreate.account });
      if (progressCallback)
        progressCallback(successCount + errorCount, accounts.length);
    } catch (error) {
      errorCount++;
      let errorMessage = "Unknown error during account import";

      if (error?.status === 500) {
        errorMessage = `Internal Server Error: ${
          error.exception || "unknown server error"
        }`;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error) {
        errorMessage = JSON.stringify(error);
      }

      results.push({ success: false, error: errorMessage });
      if (progressCallback)
        progressCallback(successCount + errorCount, accounts.length);
    }
  }

  // Return summary similar to productImport format
  return {
    status:
      errorCount === 0
        ? "success"
        : errorCount === accounts.length
        ? "failed"
        : "partial",
    successCount,
    errorCount,
    totalCount: accounts.length,
    results,
  };
};

export default accountImport;
