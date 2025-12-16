# bunny-cli

CLI for managing Bunny

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)

## Installation

1. **Clone the repository from GitHub:**

   ```bash
   git clone https://github.com/yourusername/bunny-cli.git
   cd bunny-cli
   ```

2. **Install the dependencies:**

   ```bash
   npm install
   ```

3. **Link the CLI globally:**

   ```bash
   npm link
   ```

## Configuration

Before using the CLI, you need to configure it with your Bunny instance details.

1. **Configure a profile:**

   ```bash
   bunny configure
   ```

   You will be prompted to enter the profile name, client ID, client secret, and Bunny instance URL. The profile name defaults to `default`.

## Usage

### Import Products

To import products from a JSON file:

```bash
bunny import products --file=products.json
```

### Import Subscriptions

To import subscriptions from a CSV file:

```bash
bunny import subscriptions --file=subscriptions.csv
```

### Import Historical MRR (Monthly Recurring Revenue)

To import MRR from a CSV file:

```bash
bunny import mrr --file=mrr.csv
```

## Migration

### Migrate Products from Stripe

To migrate products from Stripe to Bunny:

```bash
bunny migrate stripe products
```

This command will:

- Prompt you for your Stripe secret key (or use a saved one)
- Fetch all products, prices, features, and meters from Stripe
- Transform the data to Bunny format
- Import the products into your configured Bunny instance

You can use the `--profile` option to specify a different profile:

```bash
bunny migrate stripe products --profile=alternate
```

Use the `--verbose` flag for detailed output:

```bash
bunny migrate stripe products --verbose
```

### Migrate Products from Another Bunny Instance

To migrate a product from one Bunny instance to another:

```bash
bunny migrate bunny
```

This command will:

- Prompt you for source instance credentials (subdomain/URL, client ID, client secret)
- List all available products from the source instance
- Let you select which product to migrate
- Prompt you for destination instance credentials
- Fetch and transform the product data
- Import the product to the destination instance

Use the `--verbose` flag for detailed output:

```bash
bunny migrate bunny --verbose
```

### Using Different Profiles

You can specify a different profile using the `--profile` option:

```bash
bunny import products --file=products.json --profile=alternate
```

In this case, the credentials for the profile named `alternate` will be used.

## Local development

When running with a local development version of Bunny you will encounter an error about SSL certificate validation. You can override this by supplying the `--unsafe` option.

```bash
bunny import products --file=products.json --unsafe
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
