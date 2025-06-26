import chalk from "chalk";

const query = `query platforms {
  platforms {
    edges {
      node {
        id
        name
        code
      }
    }
  }
}`;

const platformsQuery = async (client) => {
  try {
    const response = await client.query(query, {});
    return response.data.platforms.edges.map((edge) => edge.node);
  } catch (error) {
    console.log(chalk.red("Error fetching platforms.", error));
    throw error;
  }
};

export default platformsQuery;
