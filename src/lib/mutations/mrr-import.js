import chalk from "chalk";

const mutation = `mutation legacyRecurringRevenueImport ($source: String!) {
  legacyRecurringRevenueImport (source: $source) {
      errors
  }
}`;

const mrrImport = async (client, source) => {
  try {
    const res = await client.query(mutation, { source: source });

    const legacyRecurringRevenueImport =
      res?.data?.legacyRecurringRevenueImport;

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join());
    }

    if (legacyRecurringRevenueImport?.errors) {
      if (Array.isArray(legacyRecurringRevenueImport.errors)) {
        throw new Error(legacyRecurringRevenueImport.errors.join());
      } else {
        throw new Error(legacyRecurringRevenueImport.errors);
      }
    }

    return true;
  } catch (error) {
    console.log(chalk.red("MRR Import Error"));
    if (error.status && error.status == 500) {
      console.log(chalk.red("Internal Server Error", error.exception));
    }
    if (error) {
      console.log(chalk.red(error));
    }
  }
};

export default mrrImport;
