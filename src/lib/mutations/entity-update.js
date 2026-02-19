import chalk from "chalk";

const mutation = `mutation entityUpdate ($id: ID!, $attributes: EntityAttributes!) {
  entityUpdate (id: $id, attributes: $attributes) {
    entity {
      id
      name
      brandColor
      accentColor
    }
    errors
  }
}`;

const entityUpdateMutation = async (client, id, attributes) => {
  try {
    const res = await client.query(mutation, { id, attributes });

    if (res?.errors) {
      const errorMessages = res.errors
        .map((e) => e.message || JSON.stringify(e))
        .join(", ");
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    const entityUpdate = res?.data?.entityUpdate;
    if (!entityUpdate) {
      throw new Error("Invalid response from server - no entityUpdate data");
    }

    if (entityUpdate?.errors && entityUpdate.errors.length > 0) {
      const errorMsg = Array.isArray(entityUpdate.errors)
        ? entityUpdate.errors.join(", ")
        : entityUpdate.errors;
      throw new Error(`Entity update errors: ${errorMsg}`);
    }

    return entityUpdate.entity;
  } catch (error) {
    console.log(chalk.red("Error updating entity.", error?.message || JSON.stringify(error)));
    throw error;
  }
};

export default entityUpdateMutation;
