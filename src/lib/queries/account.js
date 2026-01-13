import chalk from "chalk";

const query = `query account ($id: ID, $code: String) {
  account (id: $id, code: $code) {
    id
    code
    name
  }
}`;

const accountQuery = async (client, variables) => {
  try {
    const res = await client.query(query, variables);

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join(", "));
    }

    return res?.data?.account;
  } catch (error) {
    console.log(chalk.red("Error fetching account:", error));
    throw error;
  }
};

export default accountQuery;
