import chalk from "chalk";

const query = `query plugins ($after: String, $before: String, $first: Int, $last: Int, $filter: String, $sort: String, $viewId: ID, $format: String) {
  plugins (after: $after, before: $before, first: $first, last: $last, filter: $filter, sort: $sort, viewId: $viewId, format: $format) {
    edges {
      cursor
      node {
        enabled
        guid
        id
        name
        pluginDefinition {
            shortName
        }
        entityIds
      }
    }
    totalCount
    pageInfo {
      startCursor
      endCursor
      hasNextPage
      hasPreviousPage
    }
  }
}`;

const pluginsQuery = async (client, variables = {}) => {
  try {
    const response = await client.query(query, variables);
    return response.data.plugins.edges.map((edge) => edge.node);
  } catch (error) {
    console.log(chalk.red("Error fetching plugins.", error));
    throw error;
  }
};

export default pluginsQuery;
