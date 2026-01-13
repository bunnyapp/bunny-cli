import chalk from "chalk";

const mutation = `mutation contactCreate ($attributes: ContactAttributes!) {
  contactCreate (attributes: $attributes) {
      contact {
        accountId
        code
        createdAt
        description
        email
        entityId
        firstName
        fullName
        id
        lastName
        linkedinUrl
        mailingCity
        mailingCountry
        mailingState
        mailingStreet
        mailingZip
        mobile
        phone
        portalAccess
        salutation
        title
        updatedAt
      }
      errors
  }
}`;

const contactImport = async (client, data, options, progressCallback) => {
  // Handle both single contact and array of contacts
  const contacts = data.contacts || (Array.isArray(data) ? data : [data]);
  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const contactData of contacts) {
    try {
      // Extract attributes from the contact data structure
      const attributes = contactData.attributes || contactData;

      const res = await client.query(mutation, { attributes });

      // Log full response if verbose or if there's an error
      if (options?.verbose || res?.errors || !res?.data?.contactCreate) {
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
          contactName: attributes.fullName || `${attributes.firstName || ""} ${attributes.lastName || ""}`.trim() || attributes.email || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, contacts.length);
        continue;
      }

      const contactCreate = res?.data?.contactCreate;
      if (!contactCreate) {
        const errorMsg = "Invalid response from server - no contactCreate data";
        errorCount++;
        results.push({
          success: false,
          error: errorMsg,
          contactName: attributes.fullName || `${attributes.firstName || ""} ${attributes.lastName || ""}`.trim() || attributes.email || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, contacts.length);
        continue;
      }

      if (contactCreate?.errors) {
        let errorMsg;
        if (Array.isArray(contactCreate.errors)) {
          errorMsg = contactCreate.errors.join(", ");
        } else {
          errorMsg = contactCreate.errors;
        }
        const fullErrorMsg = `Import errors: ${errorMsg}`;
        errorCount++;
        results.push({
          success: false,
          error: fullErrorMsg,
          contactName: attributes.fullName || `${attributes.firstName || ""} ${attributes.lastName || ""}`.trim() || attributes.email || "Unknown",
        });
        if (progressCallback)
          progressCallback(successCount + errorCount, contacts.length);
        continue;
      }

      successCount++;
      results.push({ success: true, contact: contactCreate.contact });
      if (progressCallback)
        progressCallback(successCount + errorCount, contacts.length);
    } catch (error) {
      errorCount++;
      let errorMessage = "Unknown error during contact import";

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
        progressCallback(successCount + errorCount, contacts.length);
    }
  }

  // Return summary similar to accountImport format
  return {
    status:
      errorCount === 0
        ? "success"
        : errorCount === contacts.length
        ? "failed"
        : "partial",
    successCount,
    errorCount,
    totalCount: contacts.length,
    results,
  };
};

export default contactImport;
