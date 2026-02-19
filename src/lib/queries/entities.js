import chalk from "chalk";

const query = `query entities ($first: Int, $filter: String) {
  entities (first: $first, filter: $filter) {
    edges {
      node {
        id
        name
        brandColor
        accentColor
        emailTemplate
        topNavImageUrl
      }
    }
  }
}`;

const entitiesQuery = async (client, verbose = false) => {
  let response;
  try {
    response = await client.query(query, { first: 100 });
    if (verbose) {
      console.log(chalk.gray("\nEntities API response:"));
      console.log(chalk.gray(JSON.stringify(response, null, 2)));
    }
    if (!response?.data?.entities?.edges) {
      throw new Error(
        "Unexpected response structure: " + JSON.stringify(response),
      );
    }
    return response.data.entities.edges.map((edge) => edge.node);
  } catch (error) {
    // The BunnyClient Axios interceptor rejects with error.response?.data,
    // which is undefined on network failures or empty response bodies.
    if (error == null) {
      const msg =
        "API request failed with no response body. " +
        "Check that baseUrl is correct and that clientId/clientSecret are valid.";
      console.log(chalk.red(msg));
      throw new Error(msg);
    }

    // The interceptor also rejects with a plain string for OAuth errors
    // (the error_description field), or a plain object for other HTTP errors.
    const detail =
      typeof error === "string"
        ? error
        : (error?.message ?? JSON.stringify(error));

    if (verbose) {
      console.log(chalk.gray("\nRaw error from client:"));
      console.log(
        chalk.gray(
          typeof error === "object"
            ? JSON.stringify(error, null, 2)
            : String(error),
        ),
      );
    }

    console.log(chalk.red("Error fetching entities:", detail));
    throw typeof error === "string" ? new Error(error) : error;
  }
};

export default entitiesQuery;
