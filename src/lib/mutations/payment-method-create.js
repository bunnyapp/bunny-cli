import chalk from "chalk";

const mutation = `mutation paymentMethodCreate ($accountId: ID!, $pluginGuid: ID!, $token: String!) {
  paymentMethodCreate (accountId: $accountId, pluginGuid: $pluginGuid, token: $token) {
      paymentMethod {
        accountId
        createdAt
        disabled
        expirationDate
        failureCode
        id
        isDefault
        lastSuccess
        pluginId
        updatedAt
      }
      errors
  }
}`;

const paymentMethodCreate = async (client, accountId, pluginGuid, token) => {
  try {
    const res = await client.query(mutation, { accountId, pluginGuid, token });

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join());
    }

    const paymentMethodResult = res?.data?.paymentMethodCreate;

    if (paymentMethodResult?.errors) {
      if (Array.isArray(paymentMethodResult.errors)) {
        throw new Error(paymentMethodResult.errors.join());
      } else {
        throw new Error(paymentMethodResult.errors);
      }
    }

    return paymentMethodResult?.paymentMethod;
  } catch (error) {
    console.log(chalk.red("Payment Method Create Error"));
    if (error.status && error.status == 500) {
      console.log(chalk.red("Internal Server Error", error.exception));
    }
    if (error) {
      console.log(chalk.red(error));
      console.log(chalk.red(error.message));
    }
    console.log(
      chalk.red("Failed to create payment method for account:", accountId),
    );
  }
};

export default paymentMethodCreate;
