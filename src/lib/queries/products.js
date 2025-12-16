import chalk from "chalk";

const query = `query products ($after: String, $before: String, $first: Int, $last: Int, $filter: String, $viewId: ID, $sort: String) {
  products (after: $after, before: $before, first: $first, last: $last, filter: $filter, viewId: $viewId, sort: $sort) {
    edges {
      cursor
      node {
        code
        description
        everythingInPlus
        id
        internalNotes
        name
        platformId
        productCategoryId
        showProductNameOnLineItem
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

const productsQuery = async (client) => {
  try {
    const response = await client.query(query, {});

    if (!response?.data?.products?.edges) {
      throw new Error("Invalid response structure from products query");
    }
    return response.data.products.edges.map((edge) => edge.node);
  } catch (error) {
    console.log(chalk.red("Error fetching products.", error));
    throw error;
  }
};

export default productsQuery;
