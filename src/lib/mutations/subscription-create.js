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

const subscriptionCreate = async (client, attributes) => {
  try {
    const res = await client.query(mutation, attributes);
    const subscriptionCreate = res?.data?.subscriptionCreate;

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join());
    }

    if (subscriptionCreate?.errors) {
      if (Array.isArray(subscriptionCreate.errors)) {
        throw new Error(subscriptionCreate.errors.join());
      } else {
        throw new Error(subscriptionCreate.errors);
      }
    }

    return subscriptionCreate?.subscription;
  } catch (error) {
    console.log(chalk.red("Subscription Create Error"));
    if (error.status && error.status == 500) {
      console.log(chalk.red("Internal Server Error", error.exception));
    }
    if (error) {
      console.log(chalk.red(error));
      console.log(chalk.red(error.message));
    }
    console.log(JSON.stringify(attributes, null, 2));
    console.log(
      chalk.red(
        "Failed import for account:",
        attributes.attributes.account?.name || attributes.attributes.account_id
      )
    );
  }
};

export default subscriptionCreate;
