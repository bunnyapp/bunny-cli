import chalk from "chalk";

const mutation = `mutation subscriptionCreate ($attributes: SubscriptionAttributes!) {
      subscriptionCreate (attributes: $attributes) {
        subscription {
          id
          account {
            id
            name
            contacts {
              id
              firstName
              lastName
            }
          }
          trialStartDate
          trialEndDate
          startDate
          endDate
          state
          evergreen
          plan {
            code
            name
          }
          priceList {
            code
            name
          }
          tenant {
            id
            code
            name
          }
        }
        errors
      }
    }`;

const subscriptionCreate = async (client, attributes, verbose = false) => {
  try {
    const res = await client.query(mutation, attributes);
    const subscriptionCreate = res?.data?.subscriptionCreate;

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join(", "));
    }

    const errors = subscriptionCreate?.errors;
    if (errors && (!Array.isArray(errors) || errors.length > 0)) {
      throw new Error(
        Array.isArray(errors) ? errors.join(", ") : JSON.stringify(errors)
      );
    }

    return subscriptionCreate?.subscription;
  } catch (error) {
    console.log(chalk.red("Subscription Create Error"));

    // Surface a useful message regardless of what was thrown.
    const message =
      error?.message ||
      (typeof error === "object" ? JSON.stringify(error) : String(error));
    console.log(chalk.red(message));

    console.log(
      chalk.red(
        "Failed import for account:",
        attributes.attributes.account?.name || attributes.attributes.accountId
      )
    );

    // Only dump the full payload and raw server response in verbose mode.
    if (verbose) {
      const serverData = error?.response?.data;
      if (serverData) {
        console.log(chalk.gray(JSON.stringify(serverData, null, 2)));
      }
      console.log(chalk.gray(JSON.stringify(attributes, null, 2)));
    }
  }
};

export default subscriptionCreate;
